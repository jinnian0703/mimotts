<?php

namespace Tests\Unit;

use App\Support\DisplayTime;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DisplayTimeTest extends TestCase
{
    public function test_formats_utc_storage_time_as_china_time(): void
    {
        config([
            'app.timezone' => 'UTC',
            'app.display_timezone' => 'Asia/Shanghai',
        ]);

        $this->assertSame(
            '2026-06-20 20:34:56',
            DisplayTime::format(Carbon::parse('2026-06-20 12:34:56', 'UTC'))
        );
    }

    public function test_converts_china_local_input_to_storage_time(): void
    {
        config([
            'app.timezone' => 'UTC',
            'app.display_timezone' => 'Asia/Shanghai',
        ]);

        $this->assertSame(
            '2026-06-20 04:34:56',
            DisplayTime::storageFormat('2026-06-20 12:34:56')
        );
    }
}
