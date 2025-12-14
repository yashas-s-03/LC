import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import toast from 'react-hot-toast';

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
    // Removed local error state, using toast for errors now
    const [isFetching, setIsFetching] = useState(false);

    // Debounced Auto-Fetch
    useEffect(() => {
        const timer = setTimeout(async () => {
            console.log("Timer fired for:", formData.url);
            let url = formData.url;

            if (url) {
                // Case 1: Pure number (e.g. "3775")
                if (/^\d+$/.test(url.trim())) {
                    console.log("Input is numeric ID:", url);
                    // Pass directly to backend
                }
                // Case 2: "Number. Title" pattern
                else if (!url.includes('http') && !url.includes('.com') && /[0-9]+\./.test(url)) {
                    console.log("Parsing Number. Title input:", url);
                    const cleanTitle = url.replace(/^[\d\s.]*/, '').trim();
                    if (cleanTitle.length > 2) {
                        const slug = cleanTitle.toLowerCase()
                            .replace(/[^\w\s-]/g, '')
                            .replace(/\s+/g, '-');
                        url = `https://leetcode.com/problems/${slug}`;
                        console.log("Transformed to URL:", url);
                        toast("Searching by Title: " + cleanTitle, { icon: '🔍', duration: 1500 });
                    }
                }
            }

            console.log("Checking URL/ID:", url, "Title present:", !!formData.title);

            // Allow URL containing '/problems/' OR pure numeric input OR plain slug-like string
            const isUrl = url && url.includes('/problems/');
            const isId = /^\d+$/.test(url.trim());
            // const isSlug = /^[a-z0-9-]+$/.test(url.trim()); // flexible

            if ((isUrl || isId) && !formData.title) {
                setIsFetching(true);
                const toastId = toast.loading("Checking LeetCode...");
                try {
                    const res = await fetch(`${API_URL}/fetch-leetcode`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url }) // Sends the constructed URL
                    });
                    if (res.ok) {
                        const data = await res.json();
                        console.log("Fetch success:", data);
                        setFormData(prev => ({
                            ...prev,
                            title: data.title,
                            url: data.url, // Update URL to canonical one
                            difficulty: data.difficulty,
                            topics: data.topics ? data.topics.join(', ') : prev.topics
                        }));
                        toast.success("Found: " + data.title, { id: toastId });
                    } else {
                        console.error("Fetch returned not OK", res.status);
                        toast.error("Could not find problem details (Status: " + res.status + ")", { id: toastId });
                    }
                } catch (error) {
                    console.error("Fetch failed", error);
                    toast.error("Network Error: " + error.message, { id: toastId });
                } finally {
                    setIsFetching(false);
                }
            }
        }, 600); // Reduced delay

        return () => clearTimeout(timer);
    }, [formData.url]);

    const handleUrlChange = (e) => {
        setFormData({ ...formData, url: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        console.log("Submitting to:", API_URL); // Debugging

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

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to add problem');
            }

            setFormData({ title: '', url: '', difficulty: 'Easy', topics: '', notes: '' });
            if (onProblemAdded) onProblemAdded();

            // Success handled by parent or here? let's do here for form feedback
            // Parent also does toast, but that's fine.
        } catch (err) {
            console.error("Add Problem Error:", err);
            toast.error(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="card add-form">
            <h3 className="section-title" style={{ marginTop: 0, fontSize: '1.2rem' }}>✨ Add New Problem</h3>

            <div className="form-group">
                <input
                    type="text"
                    className="input-field"
                    placeholder="Paste URL, Problem ID (e.g. 3775), or Title (to autofetch details)⚡"
                    value={formData.url}
                    onChange={handleUrlChange}
                />

                <input
                    type="text"
                    className="input-field"
                    placeholder="Problem Title (e.g. Two Sum)"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    required
                />

                <div className="form-row">
                    <select
                        className="input-field"
                        value={formData.difficulty}
                        onChange={e => setFormData({ ...formData, difficulty: e.target.value })}
                    >
                        <option>Easy</option>
                        <option>Medium</option>
                        <option>Hard</option>
                    </select>

                    <input
                        type="text"
                        className="input-field"
                        placeholder="Topics (e.g. Array, DP)"
                        value={formData.topics}
                        onChange={e => setFormData({ ...formData, topics: e.target.value })}
                    />
                </div>

                <textarea
                    className="input-field textarea-field"
                    placeholder="Notes, approaches, or key learnings..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                />

                <button type="submit" disabled={loading} className="btn-primary" style={{ width: 'auto', padding: '0.8rem 2rem' }}>
                    {loading ? 'Adding...' : 'Add Problem'}
                </button>
            </div>
        </form>
    );
}
