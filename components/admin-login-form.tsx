'use client';

import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminLoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Не удалось войти');
      window.location.assign('/admin');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось войти');
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={login}>
      <label htmlFor="admin-email">Email</label>
      <Input
        id="admin-email"
        name="email"
        type="email"
        autoComplete="username"
        required
      />
      <label htmlFor="admin-password">Пароль</label>
      <Input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <Button className="gold-button" type="submit" disabled={busy}>
        {busy ? 'Вход…' : 'Войти в панель'}
      </Button>
    </form>
  );
}
