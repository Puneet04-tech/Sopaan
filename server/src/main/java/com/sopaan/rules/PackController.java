package com.sopaan.rules;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public pack distribution (design 5.2.2). Anyone can mirror a pack; the channel is not trusted,
 * so the exact bytes the reviewers signed are served unchanged and the client verifies them.
 */
@RestController
public class PackController {
    private final PackService packs;

    public PackController(PackService packs) {
        this.packs = packs;
    }

    @GetMapping("/v1/packs/{name}/{version}")
    public ResponseEntity<byte[]> pack(@PathVariable String name, @PathVariable String version) {
        byte[] body = packs.rawPack(name, version);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header("Cache-Control", "public, max-age=300")
                .body(body);
    }
}
