import { useState } from 'react'
import './App.css'

function App() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
  }

  return (
    <div className="page">
      <header className="barra">
        <div className="barra-logos">
          <img src="/header-logos.png" alt="" />
        </div>
        <nav className="barra-nav">
          <a href="#">Salas</a>
          <a href="#">Laboratórios</a>
          <a href="#">Reservas</a>
        </nav>
      </header>

      <main className="conteudo">
        <div className="lado-marca">
          <div className="marca-bolha">
            <img src="/branding.png" alt="" />
          </div>
          <div className="marca-uniuv" aria-hidden="true">
            <svg viewBox="0 0 200 48" className="marca-arcos">
              <path
                d="M20 28 Q 100 -4 180 28"
                fill="none"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M32 34 Q 100 8 168 34"
                fill="none"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <span className="marca-txt">Uniuv</span>
          </div>
        </div>

        <div className="lado-form">
          <div className="cartao">
            <div className="cartao-topo">
              <img src="/header-logos.png" alt="" />
            </div>
            <form className="form" onSubmit={handleSubmit}>
              <h1 className="titulo">Login</h1>
              <label className="campo">
                <input
                  type="text"
                  name="email"
                  autoComplete="username"
                  placeholder="Email ou Usuário"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="campo">
                <input
                  type="password"
                  name="senha"
                  autoComplete="current-password"
                  placeholder="Senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </label>
              <label className="lembrar">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                />
                Lembrar de mim
              </label>
              <button type="submit" className="btn">
                Entrar
              </button>
              <a href="#" className="esqueci">
                Esqueceu a senha?
              </a>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
