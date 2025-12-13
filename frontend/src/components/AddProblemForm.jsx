import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

export default function AddProblemForm({ onProblemAdded }) {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        title: '',
        url: '',
        difficulty: 'Easy',
        topics: '',
        notes: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_URL}/problems`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    user_id: user.id,
                    topics: formData.topics.split(',').map(t => t.trim()).filter(t => t),
                }),
            });

            if (!response.ok) throw new Error('Failed to add problem');

            setFormData({ title: '', url: '', difficulty: 'Easy', topics: '', notes: '' });
            if (onProblemAdded) onProblemAdded();
            alert('Problem added successfully!');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="add-problem-form" style={{ background: '#161b22', padding: '1.5rem', borderRadius: '8px', border: '1px solid #30363d', marginBottom: '2rem' }}>
            <h3 style={{ marginTop: 0 }}>Add New Problem</h3>
            {error && <div className="error-message">{error}</div>}

            <div style={{ display: 'grid', gap: '1rem' }}>
                <input
                    type="text"
                    placeholder="Problem Title"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius: '4px' }}
                />

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <input
                        type="url"
                        placeholder="LeetCode URL"
                        value={formData.url}
                        onChange={e => setFormData({ ...formData, url: e.target.value })}
                        style={{ flex: 1, padding: '8px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius: '4px' }}
                    />
                    <select
                        value={formData.difficulty}
                        onChange={e => setFormData({ ...formData, difficulty: e.target.value })}
                        style={{ padding: '8px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius: '4px' }}
                    >
                        <option>Easy</option>
                        <option>Medium</option>
                        <option>Hard</option>
                    </select>
                </div>

                <input
                    type="text"
                    placeholder="Topics (comma separated)"
                    value={formData.topics}
                    onChange={e => setFormData({ ...formData, topics: e.target.value })}
                    style={{ width: '100%', padding: '8px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius: '4px' }}
                />

                <textarea
                    placeholder="Notes / Approach"
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    style={{ width: '100%', padding: '8px', background: '#0d1117', border: '1px solid #30363d', color: 'white', borderRadius: '4px' }}
                />

                <button type="submit" disabled={loading} className="btn-primary" style={{ justifySelf: 'start' }}>
                    {loading ? 'Adding...' : 'Add Problem'}
                </button>
            </div>
        </form>
    );
}
