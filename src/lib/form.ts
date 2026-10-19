export function focusFirstInvalid(form: HTMLFormElement | null) {
  if (!form) return;
  requestAnimationFrame(() => {
    const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!invalid) return;
    invalid.focus();
    invalid.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}
