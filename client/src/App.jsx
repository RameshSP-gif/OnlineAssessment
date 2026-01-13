import React, { useEffect, useState, useRef } from 'react'

const API = (path, opts = {}) => fetch(path, { headers: { 'Content-Type': 'application/json', ...(opts.token? { Authorization: `Bearer ${opts.token}` } : {}) }, ...(opts.body? { body: JSON.stringify(opts.body), method: opts.method || 'POST' } : {}) }).then(r=>r.json())

export default function App(){
  const [view, setView] = useState('dashboard')
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [examQ, setExamQ] = useState([])
  const [answers, setAnswers] = useState({})
  const [examResult, setExamResult] = useState(null)
  const [examId, setExamId] = useState(null)

  useEffect(()=>{ if (token) { localStorage.setItem('token', token); fetchProfile(); } }, [token])

  const fetchProfile = async () => {
    const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const j = await res.json(); setUser(j.user) }
  }

  const register = async () => {
    const name = document.getElementById('regName').value
    const email = document.getElementById('regEmail').value
    const pass = document.getElementById('regPass').value
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, email, password: pass }) })
    const j = await res.json(); if (j.token) { setToken(j.token); setView('dashboard') }
  }

  const login = async () => {
    const email = document.getElementById('logEmail').value
    const pass = document.getElementById('logPass').value
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password: pass }) })
    const j = await res.json(); if (j.token) { setToken(j.token); setView('dashboard') }
  }

  const startExam = async () => {
    const skills = document.getElementById('skillsInput').value.split(',').map(s=>s.trim()).filter(Boolean)
    const cvText = document.getElementById('cvText').value
    const res = await fetch('/api/exam/start', { method:'POST', headers:{'Content-Type':'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({ skills, cvText }) })
    const j = await res.json(); if (j.questions) { setExamQ(j.questions); setExamId(j.examId); setView('exam-taker'); setExamResult(null); setAnswers({}) }
  }

  const submitExam = async () => {
    const res = await fetch('/api/exam/submit', { method:'POST', headers:{'Content-Type':'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({ examId: examId || 'local', answers }) })
    const j = await res.json(); setExamResult(j); setView('exam-result')
  }

  // Video recorder
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const recorderRef = useRef(null)

  const startRec = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    mediaRef.current.srcObject = s
    const rec = new MediaRecorder(s)
    recorderRef.current = rec
    chunksRef.current = []
    rec.ondataavailable = e => chunksRef.current.push(e.data)
    rec.start()
  }

  const stopRec = async () => {
    const rec = recorderRef.current
    if (!rec) return
    rec.stop()
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const fd = new FormData(); fd.append('video', blob, 'interview.webm')
      const res = await fetch('/api/video', { method:'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const j = await res.json(); alert('Video eval score: ' + (j.score||'N/A'))
    }
  }

  return (
    <div className="app-root">
      <header className="header"> <h3>OnlineExam</h3> <div>{user? user.name: 'Guest'}</div> </header>
      <div className="layout">
        <aside className="menu">
          <button onClick={()=>setView('dashboard')}>Dashboard</button>
          <button onClick={()=>setView('exam')}>Take Exam</button>
          <button onClick={()=>setView('video')}>Video Interview</button>
          <button onClick={()=>setView('profile')}>Profile</button>
        </aside>
        <main className="main">
          {view==='dashboard' && (
            <div>
              <h4>Welcome</h4>
              <div>
                <h5>Register</h5>
                <input id="regName" placeholder="Name" />
                <input id="regEmail" placeholder="Email" />
                <input id="regPass" placeholder="Password" type="password" />
                <button onClick={register}>Register</button>
              </div>
              <div>
                <h5>Login</h5>
                <input id="logEmail" placeholder="Email" />
                <input id="logPass" placeholder="Password" type="password" />
                <button onClick={login}>Login</button>
              </div>
            </div>
          )}

          {view==='exam' && (
            <div>
              <h4>Start Exam</h4>
              <div>
                <input id="skillsInput" placeholder="Skills e.g. javascript, ml" />
                <textarea id="cvText" placeholder="Paste CV text"></textarea>
                <button onClick={startExam}>Start</button>
              </div>
            </div>
          )}

          {view==='exam-taker' && (
            <div>
              <h4>Exam</h4>
              {examQ.map((q, idx)=> (
                <div key={q.id} className="question">
                  <p>{idx+1}. {q.text}</p>
                  {q.options.map((opt, i)=> (
                    <div key={i}>
                      <label>
                        <input type="radio" name={q.id} onChange={()=>setAnswers(a=>({...a, [q.id]: i}))} checked={answers[q.id]===i} /> {opt}
                      </label>
                    </div>
                  ))}
                </div>
              ))}
              <button onClick={submitExam}>Submit</button>
            </div>
          )}

          {view==='exam-result' && examResult && (
            <div>
              <h4>Result: {examResult.score}%</h4>
              <div>Correct: {examResult.correct} / {examResult.total}</div>
            </div>
          )}

          {view==='video' && (
            <div>
              <h4>Video Interview</h4>
              <video ref={el=>el && (mediaRef.current = el)} autoPlay muted style={{width:'100%',height:300,background:'#000'}} />
              <div>
                <button onClick={startRec}>Start Recording</button>
                <button onClick={stopRec}>Stop & Upload</button>
              </div>
            </div>
          )}

          {view==='profile' && (
            <div>
              <h4>Profile</h4>
              {user? <div><div>Name: {user.name}</div><div>Email: {user.email}</div></div> : <div>Not logged in</div>}
            </div>
          )}
        </main>
      </div>
      <footer className="footer">OnlineExam © 2026</footer>
    </div>
  )
}
