<?php

namespace Tests\Unit;

use App\Services\UpdateService;
use ReflectionClass;
use Tests\TestCase;

class UpdateServiceTest extends TestCase
{
    public function test_root_inspection_is_disabled_when_root_is_not_in_open_basedir(): void
    {
        $service = new UpdateService();
        $method = (new ReflectionClass($service))->getMethod('canInspectRoot');
        $method->setAccessible(true);

        $this->assertFalse($method->invoke($service, base_path().PATH_SEPARATOR.sys_get_temp_dir()));
        $this->assertTrue($method->invoke($service, ''));
        $this->assertTrue($method->invoke($service, '/'));
    }

    public function test_update_is_not_available_when_current_build_is_newer_than_latest_release(): void
    {
        $service = new UpdateService();
        $method = (new ReflectionClass($service))->getMethod('updateAvailable');
        $method->setAccessible(true);

        $current = [
            'version' => 'v1.0.0.0-1-g10ec34d-dirty',
            'commit' => '10ec34d',
        ];
        $latest = [
            'ok' => true,
            'version' => 'v1.0.0.0',
            'commit' => '9b7034a',
        ];

        $this->assertFalse($method->invoke($service, $current, $latest));
    }
}
