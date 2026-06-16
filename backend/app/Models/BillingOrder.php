<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BillingOrder extends Model
{
    protected $fillable = [
        'user_id',
        'plan_id',
        'plan_name',
        'quota',
        'amount',
        'out_trade_no',
        'trade_no',
        'status',
        'paid_at',
        'metadata',
    ];

    protected $casts = [
        'quota' => 'integer',
        'amount' => 'decimal:2',
        'paid_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
