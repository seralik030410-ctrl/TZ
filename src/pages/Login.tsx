import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { trpc } from "@/providers/trpc";

export default function Login() {
  const utils = trpc.useUtils();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = trpc.planner.auth.login.useMutation({
    onSuccess: async () => {
      await utils.planner.auth.status.invalidate();
      await utils.planner.bootstrap.invalidate();
    },
    onError: (mutationError) => setError(mutationError.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!password) return setError("Введите пароль");
    login.mutate({ password });
  };
  return (
    <main className="login-page">
      <section className="card login-card">
        <span className="brand-mark"><LockKeyhole size={23} /></span>
        <p className="eyebrow" style={{ marginTop: 24 }}>Личное пространство</p>
        <h1>С возвращением<br />в ваш ритм</h1>
        <p className="subtitle">Расписание, проекты и деньги доступны только после входа.</p>
        <form className="form-grid" style={{ marginTop: 24 }} onSubmit={submit}>
          <div className="field"><label htmlFor="login-password">Пароль</label><input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" /></div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={login.isPending}>{login.isPending ? "Проверяем…" : "Войти в ежедневник"}<ArrowRight size={17} /></button>
        </form>
        <p className="login-hint">Пароль задаётся переменной PLANNER_PASSWORD при настройке сервера.</p>
      </section>
    </main>
  );
}
