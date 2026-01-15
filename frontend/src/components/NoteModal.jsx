import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { API_URL } from '../config';

const CODE_SEP = '|||CODE_SEP|||';

export default function NoteModal({ problem, onClose, onSave }) {
    // Parse initial content
    const parseContent = (fullText) => {
        if (!fullText) return { notes: '', code: '' };
        if (fullText.includes(CODE_SEP)) {
            const [c, n] = fullText.split(CODE_SEP);
            return { code: c || '', notes: n || '' };
        }
        return { notes: fullText, code: '' }; // Backward compat
    };

    const initial = parseContent(problem.notes);
    const [note, setNote] = useState(initial.notes);
    const [code, setCode] = useState(initial.code);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const { notes, code } = parseContent(problem.notes);
        setNote(notes);
        setCode(code);
    }, [problem]);

    const handleSave = async () => {
        setSaving(true);
        // Combine code and notes
        const combined = `${code}${CODE_SEP}${note}`;

        try {
            const res = await fetch(`${API_URL}/problems/${problem.id}/notes`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    notes: combined,
                    user_id: problem.user_id
                }),
            });

            if (res.ok) {
                toast.success('Saved successfully!');
                onSave(problem.id, combined);
                onClose();
            } else {
                throw new Error('Failed to update');
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(5px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--bg-card)',
                padding: '1.5rem',
                borderRadius: '16px',
                width: '95%',
                maxWidth: '1000px', // Increased width
                height: '80vh', // Fixed height for split view
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📝</span> {problem.title}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
                </div>

                {/* Split Content */}
                <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0, marginBottom: '1rem' }}>
                    {/* Left: Code Snippet */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--accent)' }}>Code Snippet</label>
                        <textarea
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="// Paste your solution code here..."
                            style={{
                                flex: 1,
                                width: '100%',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                backgroundColor: '#1e1e1e', // Darker background for code
                                color: '#d4d4d4',
                                fontFamily: 'monospace',
                                fontSize: '0.9rem',
                                resize: 'none',
                                lineHeight: '1.5'
                            }}
                        />
                    </div>

                    {/* Right: Notes */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--accent)' }}>Revision Notes</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Key insights, time complexity, or tricks to remember..."
                            style={{
                                flex: 1,
                                width: '100%',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                resize: 'none',
                                fontFamily: 'inherit',
                                lineHeight: '1.6'
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    handleSave();
                                }
                            }}
                        />
                        <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Ctrl+Enter to save
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button
                        onClick={handleSave}
                        className="btn-primary"
                        disabled={saving}
                        style={{ minWidth: '120px' }}
                    >
                        {saving ? 'Saving...' : 'Save Note'}
                    </button>
                </div>
            </div>
        </div>
    );
}
