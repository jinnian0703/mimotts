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
    public const STATUS_ACTIVE = 'active';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_DELETED = 'deleted';

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

    public function isDeleted(): bool
    {
        return $this->status === self::STATUS_DELETED;
    }

    public function isSuspended(): bool
    {
        return $this->status === self::STATUS_SUSPENDED;
    }

    public function scopeNotDeleted($query)
    {
        return $query->where(fn ($statusQuery) => $statusQuery
            ->whereNull('status')
            ->orWhere('status', '<>', self::STATUS_DELETED));
    }

    public function scopeActiveStatus($query)
    {
        return $query->where(fn ($statusQuery) => $statusQuery
            ->whereNull('status')
            ->orWhere('status', self::STATUS_ACTIVE));
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
