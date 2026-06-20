<?php

namespace App\Support;

use DateTimeInterface;
use Illuminate\Support\Carbon;

class DisplayTime
{
    public static function timezone(): string
    {
        return (string) config('app.display_timezone', config('app.task_timezone', 'Asia/Shanghai'));
    }

    public static function format($value, string $format = 'Y-m-d H:i:s'): ?string
    {
        if (! $value) {
            return null;
        }

        if ($value instanceof Carbon) {
            return $value->copy()->timezone(self::timezone())->format($format);
        }

        if ($value instanceof DateTimeInterface) {
            return Carbon::instance($value)->timezone(self::timezone())->format($format);
        }

        return Carbon::parse((string) $value, config('app.timezone', 'UTC'))
            ->timezone(self::timezone())
            ->format($format);
    }

    public static function now(string $format = 'Y-m-d H:i:s'): string
    {
        return Carbon::now(self::timezone())->format($format);
    }

    public static function storageFormat($value, string $format = 'Y-m-d H:i:s'): ?string
    {
        if (! $value) {
            return null;
        }

        if ($value instanceof Carbon) {
            $date = $value->copy();
        } elseif ($value instanceof DateTimeInterface) {
            $date = Carbon::instance($value);
        } else {
            $date = Carbon::parse((string) $value, self::timezone());
        }

        return $date
            ->timezone(config('app.timezone', 'UTC'))
            ->format($format);
    }
}
