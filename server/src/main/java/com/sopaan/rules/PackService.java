package com.sopaan.rules;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.common.ApiException;
import com.sopaan.common.CanonicalJson;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

/** Reads the signed artifacts produced by tools/build-packs.mjs. Read-only and small. */
@Service
public class PackService {
    private static final Logger log = LoggerFactory.getLogger(PackService.class);
    private static final String SAFE = "[A-Za-z0-9._-]+";

    @Value("${sopaan.packs-dir:../packs}")
    private String packsDir;

    public Path root() {
        Path path = Path.of(packsDir);
        if (!Files.exists(path) && Files.exists(Path.of("packs"))) path = Path.of("packs");
        return path;
    }

    public Optional<JsonNode> current() {
        JsonNode latest = latest();
        if (latest == null) return Optional.empty();
        String name = latest.path("pack").path("name").asText();
        String version = latest.path("pack").path("version").asText();
        try {
            return Optional.of(readPack(name, version));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    public JsonNode latest() {
        Path latest = root().resolve("latest.json");
        if (!Files.exists(latest)) return null;
        try {
            return CanonicalJson.parse(Files.readString(latest));
        } catch (IOException e) {
            log.warn("could not read latest.json: {}", e.getMessage());
            return null;
        }
    }

    public JsonNode readPack(String name, String version) {
        requireSafe(name, version);
        Path file = root().resolve(name).resolve(version + ".json");
        if (!Files.exists(file)) throw new ApiException(404, "pack_not_found");
        try {
            return CanonicalJson.parse(Files.readString(file));
        } catch (IOException e) {
            throw new ApiException(500, "pack_unreadable");
        }
    }

    public byte[] rawPack(String name, String version) {
        requireSafe(name, version);
        Path file = root().resolve(name).resolve(version + ".json");
        if (!Files.exists(file)) throw new ApiException(404, "pack_not_found");
        try {
            return Files.readAllBytes(file);
        } catch (IOException e) {
            throw new ApiException(500, "pack_unreadable");
        }
    }

    public JsonNode readRegistry(String relPath) {
        Path file = root().resolve(relPath).normalize();
        if (!file.startsWith(root())) throw new ApiException(400, "invalid_registry_path");
        if (!Files.exists(file)) throw new ApiException(404, "registry_not_found");
        try {
            return CanonicalJson.parse(Files.readString(file));
        } catch (IOException e) {
            throw new ApiException(500, "registry_unreadable");
        }
    }

    public String rootPath() {
        return root().toAbsolutePath().toString();
    }

    private void requireSafe(String name, String version) {
        if (name == null || version == null || !name.matches(SAFE) || !version.matches(SAFE)) {
            throw new ApiException(400, "invalid_pack_path");
        }
    }

    public String utf8(String value) {
        return value == null ? null : new String(value.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
    }
}
