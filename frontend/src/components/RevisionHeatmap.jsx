import React from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';

const RevisionHeatmap = ({ problems }) => {
    // Generate last 365 days
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }
    dates.reverse(); // Oldest to newest

    // Map problems to dates (using solved_date)
    const activityMap = {};
    problems.forEach(p => {
        if (p.solved_date) {
            const dateStr = p.solved_date.split('T')[0];
            activityMap[dateStr] = (activityMap[dateStr] || 0) + 1;
        }
    });

    const getColor = (count) => {
        if (!count) return 'var(--bg-secondary)'; // Empty
        if (count === 1) return '#9be9a8';
        if (count <= 3) return '#40c463';
        if (count <= 5) return '#30a14e';
        return '#216e39';
    };

    return (
        <div className="heatmap-container" style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Revision Consistency</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>
                {dates.map(date => (
                    <div
                        key={date}
                        title={`${date}: ${activityMap[date] || 0} revisions`}
                        style={{
                            width: '10px',
                            height: '10px',
                            backgroundColor: getColor(activityMap[date]),
                            borderRadius: '2px'
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

export default RevisionHeatmap;
