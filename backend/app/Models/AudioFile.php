<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AudioFile extends Model
{
    protected $fillable = [
        'audio_job_id',
        'user_id',
        'kind',
        'disk',
        'path',
        'original_name',
        'mime_type',
        'size',
        'sha256',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function job(): BelongsTo
    {
        return $this->belongsTo(AudioJob::class, 'audio_job_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
