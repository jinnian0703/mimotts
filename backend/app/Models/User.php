<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Hash;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;
    use HasFactory;
    use Notifiable;

    protected $fillable = [
        'linuxdo_id',
        'name',
        'email',
        'pending_email',
        'email_verified_at',
        'email_verification_token',
        'email_verification_expires_at',
        'password',
        'two_factor_enabled',
        'two_factor_code_hash',
        'two_factor_expires_at',
        'avatar_url',
        'is_admin',
        'status',
        'plan_id',
        'quota_balance',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'email_verification_token',
        'two_factor_code_hash',
    ];

    protected $appends = [
        'has_password',
    ];

    protected $casts = [
        'is_admin' => 'boolean',
        'two_factor_enabled' => 'boolean',
        'email_verified_at' => 'datetime',
        'email_verification_expires_at' => 'datetime',
        'two_factor_expires_at' => 'datetime',
        'last_login_at' => 'datetime',
        'quota_balance' => 'integer',
    ];

    public function setPasswordAttribute($value): void
    {
        if ($value === null || $value === '') {
            $this->attributes['password'] = $value;

            return;
        }

        $this->attributes['password'] = Hash::needsRehash($value) ? Hash::make($value) : $value;
    }

    public function apiConfig(): HasOne
    {
        return $this->hasOne(UserApiConfig::class);
    }

    public function getHasPasswordAttribute(): bool
    {
        return ! empty($this->attributes['password'] ?? null);
    }

    public function audioJobs(): HasMany
    {
        return $this->hasMany(AudioJob::class);
    }

    public function quotaLedgerEntries(): HasMany
    {
        return $this->hasMany(QuotaLedgerEntry::class);
    }

    public function billingOrders(): HasMany
    {
        return $this->hasMany(BillingOrder::class);
    }
}
