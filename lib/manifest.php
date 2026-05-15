<?php

function is_dev(): bool
{
    return !empty(getenv('MOCK_DEV'));
}

function dev_origin(): string
{
    return 'http://localhost:5173';
}

function entry_url(string $entry, string $type = 'modern'): string
{
    if (is_dev()) {
        return dev_origin() . '/' . $entry;
    }
    return '/resource/js/dist/' . prod_entry_file($entry);
}

function prod_entry_file(string $entry): string
{
    $map = [
        'dev/home/searchbox/index.js' => 'home/searchbox.js',
        'dev/home/skin/index.js' => 'home/skin.js',
        'dev/result/ai-searchbox/index.js' => 'result/ai-searchbox.js',
        'dev/homeAI/main.js' => 'homeAI/homeAI.js',
    ];
    if (!isset($map[$entry])) {
        throw new RuntimeException("Missing prod entry mapping: {$entry}");
    }
    return $map[$entry];
}
