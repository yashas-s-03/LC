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
            <div className="login-card-container">
                <div className="auth-box">
                    <div className="logo-container">
                        <span className="hero-icon" style={{ fontSize: '2.5rem' }}>🧠</span>
                    </div>
                    <h2 style={{ marginBottom: '0.5rem', fontSize: '1.75rem', fontWeight: '500', color: '#ffffff' }}>Welcome Back</h2>
                    <p style={{ color: '#8b949e', marginBottom: '2rem' }}>
                        Sign in to track your LeetCode revision progress.
                    </p>

                    {error && <div className="error-message">{error}</div>}

                    <button onClick={handleLogin} className="btn-primary" style={{ background: '#2ea44f', width: '100%', justifyContent: 'center' }}>
                        Continue with GitHub
                    </button>
                </div>
            </div>
        </div>
    );
}