<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class SystemSetting extends Model
{
    protected $fillable = [
        'key',
        'value',
        'encrypted_value',
        'is_encrypted',
    ];

    protected $casts = [
        'value' => 'array',
        'is_encrypted' => 'boolean',
    ];

    public static function putPlain(string $key, array $value): self
    {
        return self::updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'encrypted_value' => null, 'is_encrypted' => false]
        );
    }

    public static function putEncrypted(string $key, array $value): self
    {
        return self::updateOrCreate(
            ['key' => $key],
            ['value' => null, 'encrypted_value' => Crypt::encryptString(json_encode($value)), 'is_encrypted' => true]
        );
    }

    public function decodedValue(): ?array
    {
        if ($this->is_encrypted && $this->encrypted_value) {
            return json_decode(Crypt::decryptString($this->encrypted_value), true);
        }

        return $this->value;
    }
}
