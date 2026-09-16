package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("admin_agent_validation_case")
public class AgentValidationCase {
    @TableId private String id = EntityIdGenerator.next("VC");
    private String runId;
    private int caseIndex;
    private String title;
    private String inputText;
    private String pageContext;
    private String expected;
    private String actualResponse;
    private Boolean passed;
    private String reason;
    private Instant createdAt = Instant.now();

    public String getId() {
        return id;
    }

    public void setId(String value) {
        id = value;
    }

    public String getRunId() {
        return runId;
    }

    public void setRunId(String value) {
        runId = value;
    }

    public int getCaseIndex() {
        return caseIndex;
    }

    public void setCaseIndex(int value) {
        caseIndex = value;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String value) {
        title = value;
    }

    public String getInputText() {
        return inputText;
    }

    public void setInputText(String value) {
        inputText = value;
    }

    public String getPageContext() {
        return pageContext;
    }

    public void setPageContext(String value) {
        pageContext = value;
    }

    public String getExpected() {
        return expected;
    }

    public void setExpected(String value) {
        expected = value;
    }

    public String getActualResponse() {
        return actualResponse;
    }

    public void setActualResponse(String value) {
        actualResponse = value;
    }

    public Boolean getPassed() {
        return passed;
    }

    public void setPassed(Boolean value) {
        passed = value;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String value) {
        reason = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }
}
