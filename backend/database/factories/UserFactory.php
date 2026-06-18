<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'linuxdo_id' => (string) Str::uuid(),
            'name' => $this->faker->name(),
            'email' => $this->faker->safeEmail(),
            'avatar_url' => null,
            'is_admin' => false,
            'last_login_at' => now(),
        ];
    }

    public function admin(): self
    {
        return $this->state(fn (): array => ['is_admin' => true]);
    }
}
