package com.intra.copilot.service;

import org.springframework.beans.factory.annotation.Value; import org.springframework.http.MediaType; import org.springframework.stereotype.Service; import org.springframework.web.reactive.function.client.WebClient; import reactor.core.publisher.Flux; import java.util.*;

@Service public class LlmClient {
  private final WebClient client; private final String model; private final String key;
  public LlmClient(@Value("${llm.base-url}") String base,@Value("${llm.model}") String model,@Value("${llm.api-key:}") String key){this.model=model;this.key=key; this.client=WebClient.builder().baseUrl(base).build();}
  public Flux<String> stream(String system,List<Map<String,String>> history,String user){
    List<Map<String,String>> messages=new ArrayList<>(); messages.add(Map.of("role","system","content",system)); messages.addAll(history); messages.add(Map.of("role","user","content",user));
    Map<String,Object> body=new HashMap<>(); body.put("model",model); body.put("messages",messages); body.put("stream",true); body.put("temperature",0.2);
    if(key==null || key.isBlank()) return Flux.just("[未配置 LLM_API_KEY] 后端已启动，请配置 OpenAI 兼容模型后重试。");
    return client.post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON).headers(h->h.setBearerAuth(key)).bodyValue(body).retrieve().bodyToFlux(String.class)
      .map(this::extract).filter(s->!s.isBlank()).onErrorResume(e->Flux.just("模型请求失败："+e.getMessage()));
  }
  private String extract(String raw){ try { int i=raw.indexOf("\"content\":\""); if(i<0)return ""; String s=raw.substring(i+11); int end=s.indexOf('"'); return s.substring(0,end).replace("\\n","\n").replace("\\\"","\""); } catch(Exception e){return "";} }
}
