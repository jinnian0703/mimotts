<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AnnouncementController
{
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'announcements' => Announcement::query()
                ->visibleTo($request->user())
                ->published()
                ->orderByRaw('starts_at is null, starts_at desc')
                ->latest()
                ->limit(10)
                ->get()
                ->map(fn (Announcement $announcement) => $this->serializeAnnouncement($announcement))
                ->values(),
        ]);
    }

    public function adminIndex(): JsonResponse
    {
        return response()->json([
            'announcements' => Announcement::query()
                ->latest()
                ->get()
                ->map(fn (Announcement $announcement) => $this->serializeAnnouncement($announcement))
                ->values(),
        ]);
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $announcement = Announcement::create(array_merge(
            $this->validated($request),
            [
                'created_by' => $request->user()->id,
                'updated_by' => $request->user()->id,
            ]
        ));

        $audit->record($request, 'announcement.create', 'announcement', $announcement->id);

        return response()->json([
            'announcement' => $this->serializeAnnouncement($announcement->fresh()),
        ], 201);
    }

    public function update(Request $request, Announcement $announcement, AuditLogger $audit): JsonResponse
    {
        $announcement->forceFill(array_merge(
            $this->validated($request),
            ['updated_by' => $request->user()->id]
        ))->save();

        $audit->record($request, 'announcement.update', 'announcement', $announcement->id);

        return response()->json([
            'announcement' => $this->serializeAnnouncement($announcement->fresh()),
        ]);
    }

    public function destroy(Request $request, Announcement $announcement, AuditLogger $audit): JsonResponse
    {
        $audit->record($request, 'announcement.delete', 'announcement', $announcement->id);
        $announcement->delete();

        return response()->json(['ok' => true]);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'content' => ['required', 'string', 'max:5000'],
            'level' => ['required', Rule::in(['info', 'success', 'warning', 'destructive'])],
            'audience' => ['required', Rule::in(['all', 'admin', 'user'])],
            'active' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
        ]);
    }

    private function serializeAnnouncement(Announcement $announcement): array
    {
        return [
            'id' => (string) $announcement->id,
            'title' => $announcement->title,
            'content' => $announcement->content,
            'level' => $announcement->level,
            'audience' => $announcement->audience,
            'active' => (bool) $announcement->active,
            'startsAt' => $announcement->starts_at ? $announcement->starts_at->toDateTimeString() : null,
            'endsAt' => $announcement->ends_at ? $announcement->ends_at->toDateTimeString() : null,
            'createdAt' => $announcement->created_at ? $announcement->created_at->toDateTimeString() : null,
            'updatedAt' => $announcement->updated_at ? $announcement->updated_at->toDateTimeString() : null,
        ];
    }
}
