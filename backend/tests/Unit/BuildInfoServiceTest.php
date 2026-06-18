<?php

namespace Tests\Unit;

use App\Services\BuildInfoService;
use Tests\TestCase;

class BuildInfoServiceTest extends TestCase
{
    private string $buildPath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buildPath = base_path('build.json');
    }

    protected function tearDown(): void
    {
        if (is_file($this->buildPath)) {
            @unlink($this->buildPath);
        }

        parent::tearDown();
    }

    public function test_it_reads_build_manifest_with_utf8_bom(): void
    {
        $json = "\xEF\xBB\xBF".json_encode([
            'version' => '1.2.3',
            'built_at' => '2026-06-18T12:00:00Z',
            'commit' => 'abc1234',
        ]);

        file_put_contents($this->buildPath, $json);

        $info = app(BuildInfoService::class)->info();

        $this->assertSame('1.2.3', $info['version']);
        $this->assertSame('2026-06-18T12:00:00Z', $info['built_at']);
        $this->assertSame('abc1234', $info['commit']);
    }
}
