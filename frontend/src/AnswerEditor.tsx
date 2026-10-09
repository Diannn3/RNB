import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check } from "lucide-react";
import type { SemanticField } from "./domain";
const answerSchema = z.object({
  value: z.string().max(20000, "Keep this answer under 20,000 characters."),
});
export default function AnswerEditor({
  field,
  onSave,
  onDraftChange,
  onRequired,
}: {
  field: SemanticField;
  onSave: (value: string) => void;
  onDraftChange: (dirty: boolean, value?: string) => void;
  onRequired: (required: boolean) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    watch,
  } = useForm<{ value: string }>({
    resolver: zodResolver(answerSchema),
    defaultValues: { value: field.value },
  });
  useEffect(() => reset({ value: field.value }), [field.value, reset]);
  const value = watch("value");
  useEffect(() => {
    onDraftChange(isDirty && value !== field.value, value);
  }, [value, field.value, isDirty, onDraftChange]);
  return (
    <form
      className="answer-form"
      onSubmit={handleSubmit((data) => onSave(data.value))}
    >
      {field.id.startsWith("manual:") && (
        <label className="manual-required">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onRequired(e.target.checked)}
          />{" "}
          This answer is required
        </label>
      )}
      <label htmlFor="answer-value">
        Answer{" "}
        {field.required && <span className="required-label">Required</span>}
      </label>
      {field.kind === "unsupported" ? (
        <p className="error-box">
          This field type cannot be edited here. Add a separate answer for the
          review sheet.
        </p>
      ) : field.kind === "checkbox" ? (
        <select id="answer-value" {...register("value")}>
          <option value="">Choose an answer</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      ) : field.kind === "radio" || field.kind === "dropdown" ? (
        <select id="answer-value" {...register("value")}>
          <option value="">Choose an answer</option>
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <textarea
          id="answer-value"
          {...register("value")}
          rows={field.label.toLowerCase().includes("address") ? 3 : 2}
          placeholder="Enter your answer"
          aria-invalid={!!errors.value}
          aria-describedby={errors.value ? "answer-error" : undefined}
        />
      )}{" "}
      {errors.value && (
        <p id="answer-error" role="alert">
          {errors.value.message}
        </p>
      )}
      {isDirty && value !== field.value && (
        <p className="unsaved-answer" role="status">
          Unsaved changes. Save this answer before approving or exporting.
        </p>
      )}
      <div className="answer-form-footer">
        <span>
          {field.source
            ? "Source linked"
            : field.value
              ? "Provided by you"
              : "Not answered"}
        </span>
        <button
          className="button secondary"
          disabled={field.kind === "unsupported" || value === field.value}
          type="submit"
        >
          Save answer <Check size={15} />
        </button>
      </div>
    </form>
  );
}
