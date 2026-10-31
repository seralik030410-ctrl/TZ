import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { trpc } from "@/providers/trpc";

export default function Login() {
  const token = new URLSearchParams(window.location.search).get("invite") ?? "";
  const [name, setName] = useState("");
  const authenticated = () => { window.location.replace(window.location.pathname); };
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = trpc.planner.auth.login.useMutation({
    onSuccess: authenticated,
    onError: (mutationError) => setError(mutationError.message),
  });
  const register = trpc.planner.auth.register.useMutation({ onSuccess: authenticated, onError: (mutationError) => setError(mutationError.message) });
  const busy = login.isPending || register.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!password) return setError("Введите пароль");
    if (token) { if (!name.trim()) return setError("Введите имя профиля"); register.mutate({ token, name: name.trim(), password }); }
    else login.mutate({ password });
  };
  return (
    <main className="login-page">
      <section className="card login-card">
        <span className="brand-mark"><LockKeyhole size={23} /></span>
        <p className="eyebrow" style={{ marginTop: 24 }}>Личное пространство</p>
        <h1>{token ? <>Создайте свой<br />личный профиль</> : <>С возвращением<br />в ваш ритм</>}</h1>
        <p className="subtitle">{token ? "Приглашение откроет общее пространство. Ваши личные записи останутся приватными." : "Расписание, проекты и деньги доступны только после входа."}</p>
        <form className="form-grid" style={{ marginTop: 24 }} onSubmit={submit}>
          {token && <div className="field"><label htmlFor="register-name">Ваше имя</label><input id="register-name" className="input" autoComplete="name" value={name} maxLength={100} onChange={event => setName(event.target.value)} /></div>}
          <div className="field"><label htmlFor="login-password">Пароль</label><input id="login-password" className="input" type="password" autoComplete={token ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" /></div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={busy}>{busy ? "Проверяем…" : token ? "Создать профиль" : "Войти в ежедневник"}<ArrowRight size={17} /></button>
        </form>
        <p className="login-hint">{token ? "Приглашение одноразовое. Выберите свой пароль и сохраните его." : "Используйте пароль своего профиля."}</p>
      </section>
    </main>
  );
}
