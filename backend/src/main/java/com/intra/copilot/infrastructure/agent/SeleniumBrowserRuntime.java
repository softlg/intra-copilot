package com.intra.copilot.infrastructure.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.application.agent.BrowserRuntime;
import com.intra.copilot.domain.agent.BrowserActionValidator;
import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeDriverService;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.Select;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Server-side browser runtime backed by Selenium and the installed Chrome browser. */
@Component
public class SeleniumBrowserRuntime implements BrowserRuntime {
    private static final Logger log = LoggerFactory.getLogger(SeleniumBrowserRuntime.class);
    private static final String SNAPSHOT_SCRIPT =
            """
            return (() => {
              const visible = (element) => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none'
                  && style.visibility !== 'hidden' && style.opacity !== '0';
              };
              const all = [];
              const visit = (root, framePath) => {
                const selector = "input,button,select,textarea,a,[role='button'],[contenteditable='true'],.monaco-editor,.cm-editor,[role='status'],[aria-live],pre,code,h1,h2,h3,table,[data-testid],[id*='result' i],[class*='result' i]";
                let nodes = [];
                try { nodes = Array.from(root.querySelectorAll(selector)); } catch (_) {}
                for (const node of nodes) {
                  if (!(node instanceof HTMLElement) || !visible(node)) continue;
                  const id = `sel_${all.length + 1}`;
                  node.setAttribute('data-intra-copilot-runtime-id', id);
                  const rect = node.getBoundingClientRect();
                  const text = String(node.innerText || node.value || node.getAttribute('aria-label') || node.getAttribute('title') || '')
                    .replace(/\\s+/g, ' ').trim().slice(0, 180);
                  all.push({
                    elementId: id,
                    tag: node.tagName.toLowerCase(),
                    role: node.getAttribute('role') || node.tagName.toLowerCase(),
                    name: text,
                    value: String(node.value || '').slice(0, 180),
                    framePath,
                    rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}
                  });
                }
                let frames = [];
                try { frames = Array.from(root.querySelectorAll('iframe,frame')); } catch (_) {}
                frames.forEach((frame, index) => {
                  try {
                    if (frame.contentDocument) visit(frame.contentDocument, framePath.concat(index));
                  } catch (_) {}
                });
              };
              visit(document, []);
              const lines = all.map(item =>
                `${item.elementId} <${item.tag}> role="${item.role}"${item.name ? ` name="${item.name.replace(/"/g, '\\\\"')}"` : ''}${item.value ? ` value="${item.value.replace(/"/g, '\\\\"')}"` : ''}`
              );
              return {
                snapshotId: `sel_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                frameId: 0,
                url: location.href,
                title: document.title,
                visibleText: String(document.body?.innerText || '').slice(0, 12000),
                domSummary: lines.join('\\n'),
                elements: all
              };
            })()
            """;

    private final ObjectMapper json;
    private final boolean enabled;
    private final boolean headless;
    private final long timeoutSeconds;
    private final String driverPath;
    private final String browserBinaryPath;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public SeleniumBrowserRuntime(
            ObjectMapper json,
            @Value("${browser.selenium.enabled:true}") boolean enabled,
            @Value("${browser.selenium.headless:true}") boolean headless,
            @Value("${browser.selenium.timeout-seconds:30}") long timeoutSeconds,
            @Value("${browser.selenium.driver-path:}") String driverPath,
            @Value("${browser.selenium.binary-path:}") String browserBinaryPath) {
        this.json = json;
        this.enabled = enabled;
        this.headless = headless;
        this.timeoutSeconds = Math.max(5L, Math.min(180L, timeoutSeconds));
        this.driverPath = driverPath == null ? "" : driverPath.trim();
        this.browserBinaryPath =
                browserBinaryPath == null ? "" : browserBinaryPath.trim();
    }

    @Override
    public BrowserRuntimeKind kind() {
        return BrowserRuntimeKind.SERVER;
    }

    @Override
    public boolean available() {
        return enabled;
    }

    @Override
    public boolean supports(BrowserInteractionMode interactionMode) {
        return interactionMode != BrowserInteractionMode.SYSTEM_TRUSTED;
    }

    @Override
    public Observation observe(BrowserTask task) {
        Session session = session(task);
        if (task.getStartUrl() != null
                && !task.getStartUrl().isBlank()
                && session.driver.getCurrentUrl() != null
                && !session.driver.getCurrentUrl().startsWith(task.getStartUrl())) {
            session.driver.get(task.getStartUrl());
            waitForDocumentReady(session.driver);
        }
        return snapshot(session);
    }

    @Override
    public ActionResult execute(BrowserTask task, BrowserActionValidator.NormalizedAction action) {
        Session session = session(task);
        try {
            if ("SNAPSHOT".equals(action.type())) {
                Observation observation = snapshot(session);
                return ActionResult.completed(observation, "{}");
            }
            if ("NAVIGATE".equals(action.type())) {
                String url = text(action.argumentsJson(), "url");
                session.driver.navigate().to(url);
                waitForDocumentReady(session.driver);
                boolean verified = verify(session, action.postconditionJson(), action.target(), 5000);
                Observation observation = snapshot(session);
                return verified
                        ? ActionResult.completed(observation, "{}")
                        : ActionResult.failed("导航后置条件未满足", observation);
            }
            if ("WAIT_FOR".equals(action.type())) {
                boolean verified =
                        waitForCondition(
                                session,
                                objectJson(action.argumentsJson(), "condition", "{}"),
                                action.target(),
                                5000);
                Observation observation = snapshot(session);
                return new ActionResult(
                        verified,
                        verified,
                        verified ? "EXECUTED" : "FAILED",
                        "{}",
                        observation,
                        verified ? null : "等待条件超时");
            }
            if ("VERIFY".equals(action.type())) {
                boolean verified =
                        verify(
                                session,
                                objectJson(action.argumentsJson(), "condition", "{}"),
                                action.target(),
                                1000);
                return new ActionResult(
                        verified,
                        verified,
                        verified ? "EXECUTED" : "FAILED",
                        "{}",
                        snapshot(session),
                        verified ? null : "页面条件未满足");
            }
            if ("EXTRACT".equals(action.type())) {
                String result = extract(session, action);
                return ActionResult.completed(snapshot(session), result);
            }

            String runtimeId = targetElementId(action.target());
            WebElement element = findElement(session.driver, runtimeId);
            if (requiresElement(action.type()) && element == null) {
                return ActionResult.failed("找不到目标元素", snapshot(session));
            }
            if (task.interactionMode() == BrowserInteractionMode.VISIBLE_VIRTUAL
                    || task.interactionMode() == BrowserInteractionMode.BROWSER_TRUSTED) {
                showVirtualPointer(session.driver, element);
            }
            performAction(session, element, action);
            waitAfterAction(session.driver);
            boolean verified =
                    verify(session, action.postconditionJson(), action.target(), 5000);
            Observation observation = snapshot(session);
            return verified
                    ? ActionResult.completed(observation, "{}")
                    : ActionResult.failed("动作后置条件未满足", observation);
        } catch (Exception error) {
            String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
            log.warn("Server browser action failed task={} action={}: {}",
                    task.getTaskId(), action.type(), message);
            Observation observation = null;
            try {
                observation = snapshot(session);
            } catch (Exception ignored) {
            }
            return ActionResult.failed(message, observation);
        }
    }

    @Override
    public void close(BrowserTask task) {
        Session session = sessions.remove(task.getTaskId());
        if (session != null) {
            try {
                session.driver.quit();
            } catch (Exception ignored) {
            }
        }
    }

    private Session session(BrowserTask task) {
        return sessions.computeIfAbsent(
                task.getTaskId(),
                id -> {
                    ChromeOptions options = new ChromeOptions();
                    if (!browserBinaryPath.isBlank()) {
                        options.setBinary(Path.of(browserBinaryPath).toFile());
                    }
                    if (headless) options.addArguments("--headless=new");
                    options.addArguments(
                            "--disable-gpu",
                            "--no-first-run",
                            "--no-default-browser-check",
                            "--remote-allow-origins=*",
                            "--disable-dev-shm-usage",
                            "--window-size=1440,1000");
                    ChromeDriverService.Builder serviceBuilder = new ChromeDriverService.Builder();
                    if (!driverPath.isBlank()) {
                        serviceBuilder.usingDriverExecutable(Path.of(driverPath).toFile());
                    }
                    WebDriver driver = new ChromeDriver(serviceBuilder.build(), options);
                    driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(timeoutSeconds));
                    driver.manage().timeouts().scriptTimeout(Duration.ofSeconds(timeoutSeconds));
                    if (task.getStartUrl() != null && !task.getStartUrl().isBlank()) {
                        ensureAllowedOrigin(task, task.getStartUrl());
                        driver.get(task.getStartUrl());
                        waitForDocumentReady(driver);
                        log.info(
                                "Selenium runtime navigated task={} requested={} current={}",
                                task.getTaskId(),
                                task.getStartUrl(),
                                driver.getCurrentUrl());
                    }
                    return new Session(driver);
                });
    }

    private Observation snapshot(Session session) {
        Object value = ((JavascriptExecutor) session.driver).executeScript(SNAPSHOT_SCRIPT);
        JsonNode node = json.valueToTree(value);
        String snapshotId = node.path("snapshotId").asText();
        session.snapshotId = snapshotId;
        List<Map<String, Object>> elements = new ArrayList<>();
        if (node.path("elements").isArray()) {
            for (JsonNode element : node.path("elements")) {
                elements.add(json.convertValue(element, Map.class));
            }
        }
        return new Observation(
                snapshotId,
                node.path("frameId").asInt(0),
                node.path("url").asText(""),
                node.path("title").asText(""),
                node.path("visibleText").asText(""),
                node.path("domSummary").asText(""),
                List.of(Map.of("frameId", 0, "elements", elements)));
    }

    private void performAction(
            Session session,
            WebElement element,
            BrowserActionValidator.NormalizedAction action) throws Exception {
        JsonNode args = json.readTree(action.argumentsJson());
        Actions actions = new Actions(session.driver);
        switch (action.type()) {
            case "CLICK" -> element.click();
            case "FOCUS" -> element.click();
            case "HOVER" -> actions.moveToElement(element).perform();
            case "TYPE" -> {
                element.click();
                element.sendKeys(Keys.chord(Keys.CONTROL, "a"));
                element.sendKeys(args.path("value").asText(""));
            }
            case "CLEAR" -> {
                element.click();
                element.sendKeys(Keys.chord(Keys.CONTROL, "a"), Keys.DELETE);
            }
            case "SELECT" -> {
                Select select = new Select(element);
                if (args.has("values")) {
                    select.deselectAll();
                    for (JsonNode value : args.path("values")) {
                        select.selectByValue(value.asText());
                    }
                } else {
                    select.selectByValue(args.path("value").asText());
                }
            }
            case "CHECK" -> {
                if (!element.isSelected()) element.click();
            }
            case "UNCHECK" -> {
                if (element.isSelected()) element.click();
            }
            case "SCROLL" -> ((JavascriptExecutor) session.driver)
                    .executeScript("arguments[0].scrollIntoView({block:'center'});", element);
            case "PRESS_KEY" -> element.sendKeys(toKeys(args.path("key").asText("")));
            case "UPLOAD" -> upload(element, args.path("files"));
            case "SET_EDITOR" -> setEditor(session.driver, element, args.path("code").asText(""));
            default -> throw new IllegalArgumentException("不支持的服务器浏览器动作：" + action.type());
        }
    }

    private boolean verify(
            Session session, String conditionJson, String targetJson, long timeoutMs) throws Exception {
        if (conditionJson == null || conditionJson.isBlank()) return true;
        JsonNode condition = json.readTree(conditionJson);
        long deadline = System.currentTimeMillis() + timeoutMs;
        do {
            Object result =
                    ((JavascriptExecutor) session.driver)
                            .executeScript(
                                    """
                                    return (() => {
                                      const condition = arguments[0];
                                      const target = arguments[1];
                                      const text = String(document.body?.innerText || '').replace(/\\s+/g, ' ');
                                      if (condition.urlContains && !location.href.includes(String(condition.urlContains))) return false;
                                      if (condition.textVisible && !text.includes(String(condition.textVisible).replace(/\\s+/g, ' ').trim())) return false;
                                      if (condition.documentTextContains && !text.includes(String(condition.documentTextContains).replace(/\\s+/g, ' ').trim())) return false;
                                      const element = target?.elementId
                                        ? document.querySelector(`[data-intra-copilot-runtime-id="${target.elementId}"]`)
                                        : null;
                                      if ((condition.valueEquals != null || condition.checkedEquals != null || condition.editorContains != null) && !element) return false;
                                      if (element && condition.valueEquals != null && String(element.value || '') !== String(condition.valueEquals)) return false;
                                      if (element && condition.checkedEquals != null && Boolean(element.checked) !== Boolean(condition.checkedEquals)) return false;
                                      if (element && condition.editorContains != null) {
                                        const rendered = element.innerText || element.textContent || element.value || '';
                                        const model = element.querySelector?.('textarea, [contenteditable="true"]');
                                        const actual = `${rendered} ${model?.value || model?.textContent || ''}`;
                                        if (!actual.replace(/\\s+/g, '').includes(String(condition.editorContains).replace(/\\s+/g, '').slice(0, 120))) return false;
                                      }
                                      if (condition.elementExists && !document.querySelector(`[data-intra-copilot-runtime-id="${condition.elementExists.elementId || ''}"]`)) return false;
                                      return true;
                                    })()
                                    """,
                                    json.convertValue(condition, Map.class),
                                    json.convertValue(json.readTree(targetJson == null ? "{}" : targetJson), Map.class));
            if (Boolean.TRUE.equals(result)) return true;
            Thread.sleep(120L);
        } while (System.currentTimeMillis() < deadline);
        return false;
    }

    private boolean waitForCondition(
            Session session, String conditionJson, String targetJson, long timeoutMs) throws Exception {
        return verify(session, conditionJson, targetJson, timeoutMs);
    }

    private String extract(Session session, BrowserActionValidator.NormalizedAction action) throws Exception {
        JsonNode args = json.readTree(action.argumentsJson());
        String format = args.path("format").asText("text");
        JsonNode target = json.readTree(action.target().isBlank() ? "{}" : action.target());
        String selector =
                target.path("elementId").isTextual()
                        ? "[data-intra-copilot-runtime-id=\"" + target.path("elementId").asText() + "\"]"
                        : "body";
        Object value =
                ((JavascriptExecutor) session.driver)
                        .executeScript(
                                """
                                return (() => {
                                  const element = document.querySelector(arguments[0]) || document.body;
                                  if (arguments[1] === 'html') return element.outerHTML;
                                  if (arguments[1] === 'value') return element.value ?? element.textContent ?? '';
                                  if (arguments[1] === 'code') return Array.from(element.querySelectorAll('.view-line')).map(x => x.textContent || '').join('\\n') || element.innerText || '';
                                  return element.innerText || element.textContent || '';
                                })()
                                """,
                                selector,
                                format);
        return json.writeValueAsString(Map.of("format", format, "value", value == null ? "" : value));
    }

    private void setEditor(WebDriver driver, WebElement element, String code) {
        ((JavascriptExecutor) driver)
                .executeScript(
                        """
                        (() => {
                          const element = arguments[0];
                          const code = arguments[1];
                          const host = element.closest('.monaco-editor') || element.closest('.cm-editor') || element;
                          const monaco = window.monaco;
                          const models = monaco?.editor?.getModels?.() || [];
                          for (const model of models) {
                            try {
                              model.setValue(code);
                              if (String(model.getValue?.() || '').includes(code.slice(0, 100))) return true;
                            } catch (_) {}
                          }
                          const view = host.cmView?.view || host.view;
                          if (view?.dispatch && view?.state?.doc) {
                            view.dispatch({changes:{from:0,to:view.state.doc.length,insert:code}});
                            if (String(view.state.doc.toString()).includes(code.slice(0, 100))) return true;
                          }
                          const surface = host.querySelector('textarea, [contenteditable="true"]') || host;
                          surface.focus();
                          if (surface.isContentEditable) surface.textContent = code;
                          else surface.value = code;
                          surface.dispatchEvent(new InputEvent('input', {bubbles:true, data:code}));
                          surface.dispatchEvent(new Event('change', {bubbles:true}));
                          return true;
                        })()
                        """,
                        element,
                        code);
    }

    private void showVirtualPointer(WebDriver driver, WebElement element) {
        if (element == null) return;
        try {
            ((JavascriptExecutor) driver)
                    .executeScript(
                            """
                            (() => {
                              const element = arguments[0];
                              const rect = element.getBoundingClientRect();
                              let cursor = document.getElementById('intra-copilot-server-cursor');
                              if (!cursor) {
                                cursor = document.createElement('div');
                                cursor.id = 'intra-copilot-server-cursor';
                                Object.assign(cursor.style, {
                                  position:'fixed', zIndex:'2147483647', width:'18px', height:'24px',
                                  pointerEvents:'none', transition:'all 260ms ease'
                                });
                                cursor.innerHTML = '<div style="width:14px;height:14px;border:2px solid #2563eb;border-radius:50%;background:#ffffffcc;box-shadow:0 2px 8px #0004"></div>';
                                document.documentElement.appendChild(cursor);
                              }
                              cursor.style.left = `${rect.left + rect.width / 2}px`;
                              cursor.style.top = `${rect.top + rect.height / 2}px`;
                            })()
                            """,
                            element);
            Thread.sleep(280L);
        } catch (Exception ignored) {
        }
    }

    private void waitAfterAction(WebDriver driver) throws InterruptedException {
        Thread.sleep(200L);
        waitForDocumentReady(driver);
    }

    private void waitForDocumentReady(WebDriver driver) {
        ((JavascriptExecutor) driver)
                .executeAsyncScript(
                        """
                        const done = arguments[arguments.length - 1];
                        if (document.readyState === 'complete') done(true);
                        else window.addEventListener('load', () => done(true), {once:true});
                        """);
    }

    private WebElement findElement(WebDriver driver, String runtimeId) {
        if (runtimeId == null || runtimeId.isBlank()) return null;
        List<WebElement> values =
                driver.findElements(By.cssSelector("[data-intra-copilot-runtime-id=\"" + runtimeId + "\"]"));
        return values.isEmpty() ? null : values.get(0);
    }

    private String targetElementId(String targetJson) throws Exception {
        if (targetJson == null || targetJson.isBlank()) return null;
        JsonNode target = json.readTree(targetJson);
        return target.path("elementId").asText(null);
    }

    private boolean requiresElement(String action) {
        return !List.of("WAIT_FOR", "VERIFY", "EXTRACT", "SNAPSHOT", "NAVIGATE").contains(action);
    }

    private String text(String jsonValue, String field) throws Exception {
        return text(jsonValue, field, "");
    }

    private String text(String jsonValue, String field, String fallback) throws Exception {
        if (jsonValue == null || jsonValue.isBlank()) return fallback;
        JsonNode node = json.readTree(jsonValue);
        String value = node.path(field).asText(fallback);
        return value == null ? fallback : value;
    }

    private String objectJson(String jsonValue, String field, String fallback) throws Exception {
        if (jsonValue == null || jsonValue.isBlank()) return fallback;
        JsonNode value = json.readTree(jsonValue).path(field);
        if (value.isMissingNode() || value.isNull()) return fallback;
        return value.isTextual() ? value.asText() : value.toString();
    }

    private Keys toKeys(String value) {
        try {
            return Keys.valueOf(value.toUpperCase(Locale.ROOT).replace(" ", "_"));
        } catch (IllegalArgumentException ignored) {
            return Keys.ENTER;
        }
    }

    private void upload(WebElement element, JsonNode files) throws IOException {
        List<Path> paths = new ArrayList<>();
        for (JsonNode file : files) {
            byte[] bytes = Base64.getDecoder().decode(file.path("dataBase64").asText(""));
            Path path = Files.createTempFile("intra-copilot-upload-", "-" + safeFilename(file.path("name").asText("file")));
            Files.write(path, bytes);
            path.toFile().deleteOnExit();
            paths.add(path);
        }
        element.sendKeys(paths.stream().map(Path::toString).reduce((a, b) -> a + "\n" + b).orElse(""));
    }

    private String safeFilename(String value) {
        return value == null ? "file" : value.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private void ensureAllowedOrigin(BrowserTask task, String url) {
        try {
            List<String> allowed =
                    json.readValue(
                            task.getAllowedOrigins() == null || task.getAllowedOrigins().isBlank()
                                    ? "[]"
                                    : task.getAllowedOrigins(),
                            new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
            if (allowed.isEmpty()) return;
            java.net.URI uri = java.net.URI.create(url);
            String origin =
                    (uri.getScheme() + "://" + uri.getHost()).toLowerCase(Locale.ROOT);
            boolean matched =
                    allowed.stream()
                            .map(value -> value.toLowerCase(Locale.ROOT).replaceAll("/+$", ""))
                            .anyMatch(
                                    value ->
                                            value.equals(origin)
                                                    || (value.startsWith("*.")
                                                            && origin.endsWith(value.substring(1))));
            if (!matched) {
                throw new IllegalArgumentException("页面地址不在浏览器任务允许的域名范围内");
            }
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("浏览器任务允许域名配置无效", error);
        }
    }

    private static final class Session {
        final WebDriver driver;
        String snapshotId;

        Session(WebDriver driver) {
            this.driver = driver;
        }
    }
}
