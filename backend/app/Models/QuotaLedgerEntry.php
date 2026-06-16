<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuotaLedgerEntry extends Model
{
    protected $fillable = [
        'user_id',
        'audio_job_id',
        'type',
        'module',
        'amount',
        'balance_after',
        'description',
        'metadata',
    ];

    protected $casts = [
        'amount' => 'integer',
        'balance_after' => 'integer',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function audioJob(): BelongsTo
    {
        return $this->belongsTo(AudioJob::class);
    }
}
