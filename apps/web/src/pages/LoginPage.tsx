import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  if (user) return <Navigate to="/projects" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setError('');
    try {
      await login(String(data.get('username')), String(data.get('password')));
      navigate('/projects');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败');
    } finally { setPending(false); }
  }

  return (
    <main className="login-page">
      <section className="login-form-panel">
        <form onSubmit={submit} className="login-form">
          <div className="login-brand"><BrandLogo /><strong>PMS 项目管理系统</strong></div>
          <h1>登录</h1>
          <label><span>用户名</span><input name="username" autoComplete="username" required autoFocus /></label>
          <label><span>密码</span><input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary login-submit" disabled={pending}>{pending ? '正在验证…' : '登录'}</button>
        </form>
      </section>
    </main>
  );
}
