<?php

namespace App\Exceptions;

use RuntimeException;

class InsufficientQuotaException extends RuntimeException
{
    private int $required;
    private int $balance;

    public function __construct(int $required, int $balance)
    {
        $this->required = $required;
        $this->balance = $balance;

        parent::__construct('可用额度不足');
    }

    public function required(): int
    {
        return $this->required;
    }

    public function balance(): int
    {
        return $this->balance;
    }
}
