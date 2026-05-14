<?php

function read_manifest(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $manifestPath = __DIR__ . '/../resource/js/dist-vite/.vite/manifest.json';
    $raw = @file_get_contents($manifestPath);
    if ($raw === false) {
        throw new RuntimeException(
            "Cannot read Vite manifest at {$manifestPath}. Run npm run build:vite first."
        );
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException(
            "Invalid Vite manifest at {$manifestPath}. Run npm run build:vite first."
        );
    }
    return $cached = $data;
}

function manifest_url(string $entry, string $type = 'modern'): string
{
    if ($type === 'legacy') {
        // modern entry key  dev/home/searchbox/index.js
        // legacy entry key  dev/home/searchbox/index-legacy.js
        $entry = preg_replace('/\.js$/', '-legacy.js', $entry);
    }
    $manifest = read_manifest();
    if (!isset($manifest[$entry])) {
        throw new RuntimeException("Missing manifest entry: {$entry}");
    }
    $file = $manifest[$entry]['file'] ?? null;
    if (!is_string($file) || $file === '') {
        throw new RuntimeException("Manifest entry has no 'file' field: {$entry}");
    }
    return "../resource/js/dist-vite/{$file}";
}

function polyfills_legacy_url(): string
{
    $manifest = read_manifest();
    $entry = 'vite/legacy-polyfills-legacy';
    if (!isset($manifest[$entry])) {
        throw new RuntimeException("Missing polyfills entry in manifest: {$entry}");
    }
    $file = $manifest[$entry]['file'] ?? null;
    if (!is_string($file) || $file === '') {
        throw new RuntimeException("Polyfills entry has no 'file' field: {$entry}");
    }
    return "../resource/js/dist-vite/{$file}";
}

function render_css_links(array $entries): string
{
    $manifest = read_manifest();
    $seen = [];
    $cssFiles = [];

    foreach ($entries as $entry) {
        if (!isset($manifest[$entry])) {
            throw new RuntimeException("Missing manifest entry: {$entry}");
        }
        $chunk = $manifest[$entry];
        $cssList = $chunk['css'] ?? [];
        foreach ($cssList as $cssFile) {
            if (!isset($seen[$cssFile])) {
                $seen[$cssFile] = true;
                $cssFiles[] = $cssFile;
            }
        }
    }

    $lines = [];
    foreach ($cssFiles as $cssFile) {
        $lines[] = "  <link rel=\"stylesheet\" href=\"../resource/js/dist-vite/{$cssFile}\">";
    }
    return implode("\n", $lines);
}
