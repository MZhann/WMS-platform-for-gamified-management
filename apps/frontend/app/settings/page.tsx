"use client"

import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { User as UserIcon } from "lucide-react"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
]

// Max avatar size: 2 MB before base64 encoding
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { user, updateProfile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_AVATAR_BYTES) {
      setStatus({ type: "error", text: t("settings.photoTooLarge") })
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAvatarUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await updateProfile({
        name,
        email,
        avatarUrl,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      })
      setCurrentPassword("")
      setNewPassword("")
      setStatus({ type: "success", text: t("settings.saved") })
    } catch (error: any) {
      setStatus({ type: "error", text: error.message || t("settings.error") })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="p-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">{t("settings.title")}</h1>

        {/* Profile information */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">{t("settings.profileInfo")}</h2>

          <div className="flex items-center gap-4 mb-6">
            <div className="h-20 w-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-8 w-8 text-primary" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelect}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              {t("settings.changePhoto")}
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("settings.name")}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("settings.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">{t("settings.password")}</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">{t("settings.passwordHint")}</p>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">{t("settings.language")}</h2>
          <div className="flex gap-2">
            {LANGUAGES.map((lang) => (
              <Button
                key={lang.code}
                variant={i18n.language === lang.code ? "default" : "outline"}
                onClick={() => i18n.changeLanguage(lang.code)}
              >
                {lang.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("settings.saving") : t("settings.save")}
          </Button>
          {status && (
            <span className={status.type === "success" ? "text-green-600 text-sm" : "text-destructive text-sm"}>
              {status.text}
            </span>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
