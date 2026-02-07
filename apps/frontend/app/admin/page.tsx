"use client"

import { useEffect, useState } from "react"
import { AdminRoute } from "@/components/admin-route"
import { Button } from "@/components/ui/button"
import { adminApi, SupportCommentItem } from "@/lib/api"
import { MessageSquare, Trash2 } from "lucide-react"

export default function AdminPage() {
  const [comments, setComments] = useState<SupportCommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadComments = async () => {
    try {
      setLoading(true)
      const response = await adminApi.getComments()
      setComments(response.comments)
    } catch (error) {
      console.error("Failed to load comments:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadComments()
  }, [])

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id)
      await adminApi.deleteComment(id)
      setComments((prev) => prev.filter((c) => c.id !== id))
    } catch (error) {
      console.error("Failed to delete comment:", error)
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  return (
    <AdminRoute>
      <div className="p-6 lg:p-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
        <p className="mt-1 text-muted-foreground">
          Manage support comments from users
        </p>

        <div className="mt-8 rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquare className="h-5 w-5 text-primary" />
              Support Comments
            </h2>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
              </div>
            ) : comments.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">
                No comments yet
              </p>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-lg border border-border bg-muted/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{comment.name}</span>
                          <span className="text-muted-foreground">•</span>
                          <a
                            href={`mailto:${comment.email}`}
                            className="text-primary hover:underline"
                          >
                            {comment.email}
                          </a>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground text-xs">
                            {formatDate(comment.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm">
                          {comment.message}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleDelete(comment.id)}
                        disabled={deletingId === comment.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminRoute>
  )
}
