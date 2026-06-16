<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AudioJob extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'model',
        'status',
        'request_payload',
        'response_payload',
        'error_message',
        'started_at',
        'completed_at',
    ];

    protected $casts = [
        'request_payload' => 'array',
        'response_payload' => 'array',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function files(): HasMany
    {
        return $this->hasMany(AudioFile::class);
    }

    public function quotaLedgerEntries(): HasMany
    {
        return $this->hasMany(QuotaLedgerEntry::class);
    }
}
