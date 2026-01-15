import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function Login() {
    const { signInWithGithub, user } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState(null);

    useEffect(() => {
        if (user) {
            navigate('/');
        }
    }, [user, navigate]);

    const handleLogin = async () => {
        try {
            await signInWithGithub();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="login-page">
            {/* Background Particles from index.css will show here automatically */}

            <div className="login-hero">
                {/* Left Side: Hero Text */}
                <div className="hero-content">
                    <h1>Master Your<br />LeetCode Revision</h1>
                    <span className="hero-icon" style={{ fontSize: '5rem' }}>🧠</span>
                    <p className="hero-subtitle">
                        Spaced repetition that actually works. <br />
                        Track, revise, and conquer your coding interviews.
                    </p>

                    <div className="feature-grid">
                        <div className="mini-stat" style={{ background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '1.5rem' }}>📅</span>
                            <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Smart Schedule</span>
                        </div>
                        <div className="mini-stat" style={{ background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '1.5rem' }}>📊</span>
                            <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Visual Stats</span>
                        </div>
                        <div className="mini-stat" style={{ background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '1.5rem' }}>📝</span>
                            <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Notes Support</span>
                        </div>
                    </div>
                </div>

                {/* Right Side: Auth Box */}
                <div className="auth-box">
                    <h2 style={{ marginBottom: '0.5rem', fontWeight: '700' }}>Welcome Back</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.95rem' }}>
                        Please sign in to continue
                    </p>

                    {error && (
                        <div className="alert alert-error" style={{ marginBottom: '1rem', textAlign: 'left', fontSize: '0.9rem' }}>
                            <span>⚠️ {error}</span>
                        </div>
                    )}

                    <button
                        onClick={handleLogin}
                        className="btn-primary"
                        style={{
                            width: '100%',
                            justifyContent: 'center',
                            padding: '1rem',
                            fontSize: '1.1rem',
                            background: '#2ea44f',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}
                    >
                        <svg height="24" viewBox="0 0 16 16" version="1.1" width="24" aria-hidden="true" style={{ fill: 'white' }}>
                            <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                        </svg>
                        Continue with GitHub
                    </button>

                    <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Secure login powered by Supabase
                    </p>
                </div>
            </div>
        </div>
    );
}