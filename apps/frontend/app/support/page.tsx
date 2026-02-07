"use client"

import { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { supportApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/AuthContext"
import { MessageSquare, Phone } from "lucide-react"

// Contact details - configure these for your support
const SUPPORT_PHONE = "+1234567890"
const SUPPORT_WHATSAPP = "1234567890"
const SUPPORT_TELEGRAM = "your_support_bot"

// WhatsApp icon component
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

// Telegram icon component
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

export default function SupportPage() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [comment, setComment] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setName(user.name ?? "")
      setEmail(user.email ?? "")
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await supportApi.createComment({ name, email, message: comment })
      setSubmitted(true)
      setComment("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit comment")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="p-6 lg:p-8">
        <h1 className="text-3xl font-bold tracking-tight">Support</h1>
        <p className="mt-1 text-muted-foreground">
          Get help or leave feedback. We&apos;re here for you.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          {/* Comment form */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <MessageSquare className="h-5 w-5 text-primary" />
              Leave a comment
            </h2>
            {submitted ? (
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                <p className="font-medium text-primary">Thank you for your feedback!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We&apos;ll get back to you as soon as possible.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSubmitted(false)}
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comment">Comment / Message</Label>
                  <Textarea
                    id="comment"
                    placeholder="How can we help? Describe your question or feedback..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={5}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send comment"}
                </Button>
              </form>
            )}
          </div>

          {/* Contact buttons */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Connect with us</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Reach out via your preferred channel. We typically respond within 24 hours.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 gap-3 bg-[#25D366]/5 hover:bg-[#25D366]/10 border-[#25D366]/30 text-[#25D366] hover:text-[#25D366]"
                asChild
              >
                <a
                  href={`https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  WhatsApp
                </a>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="flex-1 gap-3"
                asChild
              >
                <a href={`tel:${SUPPORT_PHONE}`}>
                  <Phone className="h-5 w-5" />
                  Call us
                </a>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="flex-1 gap-3 bg-[#0088cc]/5 hover:bg-[#0088cc]/10 border-[#0088cc]/30 text-[#0088cc] hover:text-[#0088cc]"
                asChild
              >
                <a
                  href={`https://t.me/${SUPPORT_TELEGRAM}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <TelegramIcon className="h-5 w-5" />
                  Telegram
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
