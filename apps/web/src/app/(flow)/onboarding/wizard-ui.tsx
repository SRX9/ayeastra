"use client";

import { Button, Input, Label, TextField, Tooltip } from "@heroui/react";
import { ArrowDown, ArrowUp, Plus, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";

/** Shared wizard primitives — fields, list editors, option cards, badges. */

/* ------------------------------------------------------------------ */
/* Motion vocabulary                                                    */
/* ------------------------------------------------------------------ */

export const fieldStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

export const fieldRise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

/* ------------------------------------------------------------------ */
/* AI provenance badge                                                  */
/* ------------------------------------------------------------------ */

export function AiBadge() {
  return (
    <span
      title="Drafted by AI from your website — edit freely"
      className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] leading-none text-accent-soft-foreground"
    >
      <Sparkles aria-hidden className="size-2.5" />
      AI
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Field wrapper                                                        */
/* ------------------------------------------------------------------ */

export function FieldNote({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return (
      <p role="alert" className="text-xs text-danger">
        {error}
      </p>
    );
  }
  if (hint) return <p className="text-xs text-muted">{hint}</p>;
  return null;
}

export function TextRow({
  label,
  value,
  onChange,
  error,
  hint,
  ai,
  placeholder,
  autoFocus,
  name,
  list,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  ai?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  name: string;
  /** id of a <datalist> rendered elsewhere (timezone suggestions). */
  list?: string;
  trailing?: ReactNode;
}) {
  return (
    <motion.div variants={fieldRise} className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {ai && <AiBadge />}
        {trailing && <span className="ml-auto">{trailing}</span>}
      </div>
      <TextField
        name={name}
        aria-label={label}
        fullWidth
        value={value}
        onChange={onChange}
        isInvalid={!!error}
      >
        <Input placeholder={placeholder} autoFocus={autoFocus} list={list} />
      </TextField>
      <FieldNote error={error} hint={hint} />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Suggestion chips (stage examples, etc.)                              */
/* ------------------------------------------------------------------ */

export function SuggestionChips({
  options,
  onPick,
  current,
}: {
  options: string[];
  onPick: (v: string) => void;
  current: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {options.map((option) => {
        const active = current.trim().toLowerCase() === option.toLowerCase();
        return (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors ${
              active
                ? "border-accent bg-accent-soft text-accent-soft-foreground"
                : "border-border text-muted hover:border-border-secondary hover:text-foreground"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* List editors                                                         */
/* ------------------------------------------------------------------ */

export function ListEditor({
  label,
  hint,
  items,
  onChange,
  error,
  ai,
  placeholder,
  ordered = false,
  max = 20,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  error?: string;
  ai?: boolean;
  placeholder: string;
  /** Ranked rows with reorder controls instead of wrapping chips. */
  ordered?: boolean;
  max?: number;
}) {
  const [pending, setPending] = useState("");

  const add = () => {
    const text = pending.trim();
    if (!text || items.length >= max) return;
    if (items.some((i) => i.toLowerCase() === text.toLowerCase())) {
      setPending("");
      return;
    }
    onChange([...items, text]);
    setPending("");
  };

  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  };

  return (
    <motion.div variants={fieldRise} className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {ai && <AiBadge />}
      </div>

      {ordered ? (
        <ul className="grid gap-1">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item, index) => (
              <motion.li
                key={item}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="group flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="w-4 text-right font-mono text-xs text-muted tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{item}</span>
                <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Tooltip delay={400}>
                    <Button
                      type="button"
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${item} up`}
                      isDisabled={index === 0}
                      onPress={() => move(index, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Tooltip.Content>Move up</Tooltip.Content>
                  </Tooltip>
                  <Tooltip delay={400}>
                    <Button
                      type="button"
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${item} down`}
                      isDisabled={index === items.length - 1}
                      onPress={() => move(index, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Tooltip.Content>Move down</Tooltip.Content>
                  </Tooltip>
                  <Tooltip delay={400}>
                    <Button
                      type="button"
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${item}`}
                      onPress={() => remove(index)}
                    >
                      <X className="size-3.5" />
                    </Button>
                    <Tooltip.Content>Remove</Tooltip.Content>
                  </Tooltip>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {items.map((item, index) => (
                <motion.span
                  key={item}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-1.5 text-xs"
                >
                  {item}
                  <button
                    type="button"
                    aria-label={`Remove ${item}`}
                    onClick={() => remove(index)}
                    className="cursor-pointer rounded-full p-0.5 text-muted transition-colors hover:bg-default hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        )
      )}

      <div className="flex items-center gap-2">
        <TextField
          aria-label={`Add to ${label.toLowerCase()}`}
          fullWidth
          value={pending}
          onChange={setPending}
          isDisabled={items.length >= max}
        >
          <Input
            placeholder={items.length >= max ? `Maximum ${max} reached` : placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </TextField>
        <Button
          type="button"
          isIconOnly
          variant="outline"
          aria-label={`Add to ${label.toLowerCase()}`}
          isDisabled={!pending.trim() || items.length >= max}
          onPress={add}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <FieldNote error={error} hint={hint} />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Option cards (native radios — free keyboard + focus semantics)       */
/* ------------------------------------------------------------------ */

export function OptionCards<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  ai,
}: {
  label: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; title: string; description: string }>;
  ai?: boolean;
}) {
  return (
    <motion.fieldset variants={fieldRise} className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Label elementType="legend">{label}</Label>
        {ai && <AiBadge />}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={`cursor-pointer rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                selected
                  ? "border-accent bg-accent-soft"
                  : "border-border hover:border-border-secondary"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className={`block text-sm font-medium ${selected ? "text-accent-soft-foreground" : ""}`}>
                {option.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
            </label>
          );
        })}
      </div>
    </motion.fieldset>
  );
}
