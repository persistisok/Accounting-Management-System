import { ArrowRight, DatabaseZap, FileCheck2, Landmark } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true); setError('');
    try {
      await login(String(data.get('username')), String(data.get('password')));
      navigate('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败');
    } finally { setPending(false); }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand"><span className="brand-mark">账</span><strong>项目账册</strong></div>
        <div className="story-copy"><p className="eyebrow light">业务数据中枢</p><h1>从一笔金额，<br />找到它的全部来路。</h1><p>项目编码连接合同、银行流水与发票。每次汇总都能回到原始凭证。</p></div>
        <div className="story-rail">
          <span><FileCheck2 />支持协议</span><i /><span><Landmark />资金流水</span><i /><span><DatabaseZap />项目汇总</span>
        </div>
        <p className="login-footnote">项目 · 合同 · 流水 · 发票 · 基础资料</p>
      </section>
      <section className="login-form-panel">
        <form onSubmit={submit} className="login-form">
          <p className="eyebrow">安全访问</p><h2>进入项目账册</h2><p className="muted">使用已分配的业务账号登录</p>
          <label><span>用户名</span><input name="username" autoComplete="username" defaultValue="admin" required /></label>
          <label><span>密码</span><input name="password" type="password" autoComplete="current-password" defaultValue="Admin123!" required /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary login-submit" disabled={pending}>{pending ? '正在验证…' : <>登录 <ArrowRight size={17} /></>}</button>
          <small className="demo-note">演示账号：admin / Admin123!</small>
        </form>
      </section>
    </main>
  );
}
