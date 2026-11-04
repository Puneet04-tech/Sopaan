package com.sopaan.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.passport.CredentialService;
import com.sopaan.passport.RegistryService;
import com.sopaan.rules.PackService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class MetaController {
    private final PackService packs;
    private final RegistryService registry;
    private final CredentialService credentials;

    @Value("${sopaan.profile:cloud}")
    private String profile;

    @Value("${sopaan.demo-mode:false}")
    private boolean demoMode;

    public MetaController(PackService packs, RegistryService registry, CredentialService credentials) {
        this.packs = packs;
        this.registry = registry;
        this.credentials = credentials;
    }

    @GetMapping("/v1/meta")
    public Map<String, Object> meta() {
        JsonNode latest = packs.latest();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "sopaan");
        body.put("profile", profile);
        body.put("demo_mode", demoMode);
        body.put("server_time", Instant.now().toString());
        body.put("packs_dir", packs.rootPath());
        if (latest != null) {
            body.put("pack", latest.path("pack"));
            body.put("registry", latest.path("registry"));
        }
        body.put("registry_epoch", registry.epoch());
        body.put("issuers", registry.issuers().size());
        body.put("credentials", credentials.stats());
        body.put("note", "Demo keys and simulated credits. Rule packs are unverified against official portals.");
        return body;
    }
}
