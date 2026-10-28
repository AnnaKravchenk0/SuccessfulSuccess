"use client"

import { Loader2, Sparkles, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSaveAgenda } from "@/hooks/use-meetings"
import { ApiError, parseAgendaText } from "@/lib/api"
import type { AiSuggestion, Meeting, ParsedAgenda } from "@/lib/types"

type FormState = {
  title: string
  startsAt: string
  durationMinutes: string
  language: string
  items: Array<{ topic: string; owner: string; minutes: string }>
  actionItems: Array<{ task: string; owner: string; due: string }>
}

type SuggestedKeys = Set<string>

function emptyForm(): FormState {
  return {
    title: "",
    startsAt: "",
    durationMinutes: "",
    language: "",
    items: [{ topic: "", owner: "", minutes: "" }],
    actionItems: [{ task: "", owner: "", due: "" }],
  }
}

function fromMeeting(meeting: Meeting): FormState {
  const agendaItems = meeting.agenda_items ?? []
  const actionItems = meeting.action_items ?? []
  return {
    title: meeting.name,
    startsAt: meeting.starts_at.slice(0, 16),
    durationMinutes: String(
      Math.max(
        1,
        Math.round(
          (new Date(meeting.ends_at).getTime() - new Date(meeting.starts_at).getTime()) / 60_000,
        ),
      ),
    ),
    language: meeting.agenda_language ?? "",
    items:
      agendaItems.length > 0
        ? agendaItems.map((item) => ({
            topic: item.topic,
            owner: item.owner ?? "",
            minutes: item.minutes != null ? String(item.minutes) : "",
          }))
        : [{ topic: "", owner: "", minutes: "" }],
    actionItems:
      actionItems.length > 0
        ? actionItems.map((item) => ({
            task: item.task,
            owner: item.owner ?? "",
            due: item.due ?? "",
          }))
        : [{ task: "", owner: "", due: "" }],
  }
}

function fromParsed(agenda: ParsedAgenda, fallback: FormState): FormState {
  return {
    title: agenda.title ?? fallback.title,
    startsAt: agenda.starts_at ? agenda.starts_at.slice(0, 16) : fallback.startsAt,
    durationMinutes:
      agenda.duration_minutes != null ? String(agenda.duration_minutes) : fallback.durationMinutes,
    language: agenda.language || fallback.language,
    items:
      agenda.items.length > 0
        ? agenda.items.map((item) => ({
            topic: item.topic,
            owner: item.owner ?? "",
            minutes: item.minutes != null ? String(item.minutes) : "",
          }))
        : [{ topic: "", owner: "", minutes: "" }],
    actionItems:
      agenda.action_items.length > 0
        ? agenda.action_items.map((item) => ({
            task: item.task,
            owner: item.owner ?? "",
            due: item.due ?? "",
          }))
        : [{ task: "", owner: "", due: "" }],
  }
}

function suggestedFromParsed(agenda: ParsedAgenda): SuggestedKeys {
  const keys = new Set<string>()
  if (agenda.title) keys.add("title")
  if (agenda.starts_at) keys.add("startsAt")
  if (agenda.duration_minutes != null) keys.add("durationMinutes")
  if (agenda.language) keys.add("language")
  agenda.items.forEach((item, index) => {
    if (item.topic) keys.add(`items.${index}.topic`)
    if (item.owner) keys.add(`items.${index}.owner`)
    if (item.minutes != null) keys.add(`items.${index}.minutes`)
  })
  agenda.action_items.forEach((item, index) => {
    if (item.task) keys.add(`actionItems.${index}.task`)
    if (item.owner) keys.add(`actionItems.${index}.owner`)
    if (item.due) keys.add(`actionItems.${index}.due`)
  })
  return keys
}

function Suggested({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] font-medium">
      suggested
    </Badge>
  )
}

function parseErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong."
  if (err.code === "aborted") return "Parsing cancelled."
  if (err.code === "payload_too_large") return "The text is too long (max 10,000 characters)."
  if (err.code === "parse_failed") return err.message || "The model could not find an agenda."
  if (err.code === "busy") return "The parser is busy. Try again in a moment."
  if (err.code === "network_error" || err.code === "parser_not_configured") return err.message
  return err.message
}

export function AgendaDialog({
  meeting,
  open,
  onOpenChange,
}: {
  meeting?: Meeting
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const save = useSaveAgenda()
  const [paste, setPaste] = useState("")
  const [form, setForm] = useState<FormState>(emptyForm())
  const [suggested, setSuggested] = useState<SuggestedKeys>(new Set())
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null)
  const [parsing, setParsing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open && meeting) {
      setForm(fromMeeting(meeting))
      setPaste("")
      setSuggested(new Set())
      setSuggestion(null)
      setParsing(false)
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [open, meeting])

  const touch = (key: string) => {
    setSuggested((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const onParse = async () => {
    if (!paste.trim()) {
      toast.error("Paste some agenda text first.")
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setParsing(true)
    try {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }).format(new Date())
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const result = await parseAgendaText(paste, today, tz, controller.signal)
      setForm((prev) => fromParsed(result.agenda, prev))
      setSuggested(suggestedFromParsed(result.agenda))
      setSuggestion({
        agenda: result.agenda,
        model: result.model,
        prompt_version: result.prompt_version,
      })
      toast.success("Agenda suggested — review and save.")
    } catch (err) {
      if (err instanceof ApiError && err.code === "aborted") return
      toast.error(parseErrorMessage(err))
    } finally {
      setParsing(false)
      abortRef.current = null
    }
  }

  const onCancelParse = () => {
    abortRef.current?.abort()
    setParsing(false)
  }

  const onSave = async () => {
    if (!meeting) return
    const items = form.items
      .map((item) => ({
        topic: item.topic.trim(),
        owner: item.owner.trim() || null,
        minutes: item.minutes.trim() ? Number(item.minutes) : null,
      }))
      .filter((item) => item.topic)
    const action_items = form.actionItems
      .map((item) => ({
        task: item.task.trim(),
        owner: item.owner.trim() || null,
        due: item.due.trim() || null,
      }))
      .filter((item) => item.task)

    try {
      await save.mutateAsync({
        id: meeting.id,
        payload: {
          title: form.title.trim() || null,
          starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          duration_minutes: form.durationMinutes.trim()
            ? Number(form.durationMinutes)
            : null,
          items,
          action_items,
          language: form.language.trim() || null,
          ai_suggestion: suggestion,
        },
      })
      toast.success("Agenda saved.")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the agenda.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {meeting ? (
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agenda</DialogTitle>
            <DialogDescription>
              Paste notes or an email, let the model suggest a structure, then check and save.
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4" aria-hidden />
              Paste an agenda
            </div>
            <Textarea
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder="Пн 10:00, синк по прайсингу, 45 хв. 1) нові тарифи…"
              rows={4}
              disabled={parsing}
              maxLength={10_000}
            />
            <div className="flex flex-wrap items-center gap-2">
              {parsing ? (
                <>
                  <Button type="button" variant="secondary" disabled>
                    <Loader2 className="animate-spin" aria-hidden />
                    Parsing…
                  </Button>
                  <Button type="button" variant="outline" onClick={onCancelParse}>
                    <X aria-hidden />
                    Cancel
                  </Button>
                  <p className="text-muted-foreground text-xs">Usually 2–8 seconds.</p>
                </>
              ) : (
                <Button type="button" onClick={onParse}>
                  <Sparkles aria-hidden />
                  Parse
                </Button>
              )}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="agenda-title">
                Title
                <Suggested show={suggested.has("title")} />
              </Label>
              <Input
                id="agenda-title"
                value={form.title}
                onChange={(event) => {
                  touch("title")
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agenda-starts">
                Starts at
                <Suggested show={suggested.has("startsAt")} />
              </Label>
              <Input
                id="agenda-starts"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => {
                  touch("startsAt")
                  setForm((prev) => ({ ...prev, startsAt: event.target.value }))
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agenda-duration">
                Duration (minutes)
                <Suggested show={suggested.has("durationMinutes")} />
              </Label>
              <Input
                id="agenda-duration"
                type="number"
                min={1}
                max={600}
                value={form.durationMinutes}
                onChange={(event) => {
                  touch("durationMinutes")
                  setForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                }}
              />
            </div>
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Agenda items</h3>
            {form.items.map((item, index) => (
              <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                <div className="space-y-1 sm:col-span-3">
                  <Label>
                    Topic
                    <Suggested show={suggested.has(`items.${index}.topic`)} />
                  </Label>
                  <Input
                    value={item.topic}
                    onChange={(event) => {
                      touch(`items.${index}.topic`)
                      setForm((prev) => {
                        const items = [...prev.items]
                        items[index] = { ...items[index], topic: event.target.value }
                        return { ...prev, items }
                      })
                    }}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>
                    Owner
                    <Suggested show={suggested.has(`items.${index}.owner`)} />
                  </Label>
                  <Input
                    value={item.owner}
                    onChange={(event) => {
                      touch(`items.${index}.owner`)
                      setForm((prev) => {
                        const items = [...prev.items]
                        items[index] = { ...items[index], owner: event.target.value }
                        return { ...prev, items }
                      })
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>
                    Min
                    <Suggested show={suggested.has(`items.${index}.minutes`)} />
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={480}
                    value={item.minutes}
                    onChange={(event) => {
                      touch(`items.${index}.minutes`)
                      setForm((prev) => {
                        const items = [...prev.items]
                        items[index] = { ...items[index], minutes: event.target.value }
                        return { ...prev, items }
                      })
                    }}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  items: [...prev.items, { topic: "", owner: "", minutes: "" }],
                }))
              }
            >
              Add item
            </Button>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Action items</h3>
            {form.actionItems.map((item, index) => (
              <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                <div className="space-y-1 sm:col-span-3">
                  <Label>
                    Task
                    <Suggested show={suggested.has(`actionItems.${index}.task`)} />
                  </Label>
                  <Input
                    value={item.task}
                    onChange={(event) => {
                      touch(`actionItems.${index}.task`)
                      setForm((prev) => {
                        const actionItems = [...prev.actionItems]
                        actionItems[index] = { ...actionItems[index], task: event.target.value }
                        return { ...prev, actionItems }
                      })
                    }}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>
                    Owner
                    <Suggested show={suggested.has(`actionItems.${index}.owner`)} />
                  </Label>
                  <Input
                    value={item.owner}
                    onChange={(event) => {
                      touch(`actionItems.${index}.owner`)
                      setForm((prev) => {
                        const actionItems = [...prev.actionItems]
                        actionItems[index] = { ...actionItems[index], owner: event.target.value }
                        return { ...prev, actionItems }
                      })
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>
                    Due
                    <Suggested show={suggested.has(`actionItems.${index}.due`)} />
                  </Label>
                  <Input
                    type="date"
                    value={item.due}
                    onChange={(event) => {
                      touch(`actionItems.${index}.due`)
                      setForm((prev) => {
                        const actionItems = [...prev.actionItems]
                        actionItems[index] = { ...actionItems[index], due: event.target.value }
                        return { ...prev, actionItems }
                      })
                    }}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  actionItems: [...prev.actionItems, { task: "", owner: "", due: "" }],
                }))
              }
            >
              Add action
            </Button>
          </section>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={save.isPending || parsing}>
              {save.isPending ? "Saving…" : "Save agenda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
