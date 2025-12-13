
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
        <div className="login-container">
            <div className="login-card">
                <h1>Welcome Back</h1>
                <p>Sign in to track your LeetCode progress</p>

                {error && <div className="error-message">{error}</div>}

                <button onClick={handleLogin} className="btn-primary">
                    Sign in with GitHub
                </button>
            </div>
        </div>
    );
}
