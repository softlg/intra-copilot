package com.intra.copilot.web;

import com.intra.copilot.model.EmbeddingProfile;
import com.intra.copilot.service.EmbeddingClient;
import com.intra.copilot.service.EmbeddingProfileService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class EmbeddingProfileAdminController {
    private final EmbeddingProfileService profiles;
    private final EmbeddingClient embeddings;
    public EmbeddingProfileAdminController(EmbeddingProfileService profiles, EmbeddingClient embeddings) { this.profiles = profiles; this.embeddings = embeddings; }
    @GetMapping("/embedding-profiles") public List<EmbeddingProfile> list() { return profiles.listAll(); }
    @PostMapping("/embedding-profiles") @ResponseStatus(HttpStatus.CREATED) public EmbeddingProfile create(@RequestBody EmbeddingProfile profile) { return profiles.save(profile); }
    @PutMapping("/embedding-profiles/{profileId}") public EmbeddingProfile update(@PathVariable String profileId, @RequestBody EmbeddingProfile profile) { profile.setId(profileId); return profiles.save(profile); }
    @GetMapping("/knowledge-bases/{id}/embedding-config") public Config config(@PathVariable String id) {
        EmbeddingProfile profile = profiles.resolveByKnowledgeBaseId(id);
        return new Config(profile, "system-default-embedding".equals(profile.getId()));
    }
    @PutMapping("/knowledge-bases/{id}/embedding-config") public Config update(@PathVariable String id, @RequestBody EmbeddingProfileService.EmbeddingConfigRequest request) {
        EmbeddingProfile profile = profiles.applyConfig(id, request);
        return new Config(profile, "system-default-embedding".equals(profile.getId()));
    }
    @PostMapping("/knowledge-bases/{id}/embedding-config/validate") public Validation validate(@PathVariable String id) {
        EmbeddingProfile profile = profiles.resolveByKnowledgeBaseId(id); long started = System.currentTimeMillis();
        try { int actual = embeddings.embed("embedding configuration health check", profile).size(); return new Validation(true, profile, actual, System.currentTimeMillis() - started, null); }
        catch (RuntimeException error) { return new Validation(false, profile, null, System.currentTimeMillis() - started, error.getMessage()); }
    }
    public record Config(EmbeddingProfile profile, boolean inheritedOrResolved) {}
    public record Validation(boolean reachable, EmbeddingProfile profile, Integer actualDimension, long latencyMs, String error) {}
}
