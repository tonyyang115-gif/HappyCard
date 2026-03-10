Component({
    properties: {
        rounds: {
            type: Array,
            value: [],
            observer: 'generateChartData'
        },
        players: {
            type: Array,
            value: [],
            observer: 'generateChartData'
        }
    },

    data: {
        chartUrl: '',
        minScore: 0,
        maxScore: 0,
        width: 350,
        height: 200,
        colors: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
    },

    methods: {
        // Prevent touch event bubbling to parent overlay
        preventTouchMove: function(e) {
            // This will stop the touchmove event from bubbling up
            // Return true to allow scroll-view's own scrolling
            return true;
        },
        
        onTouchStart: function(e) {
            // Mark that scrolling started inside chart
            this._isScrolling = true;
        },
        
        onTouchMove: function(e) {
            // Keep tracking scroll state
            this._isScrolling = true;
        },
        
        onTouchEnd: function(e) {
            // Reset scroll state after touch ends
            setTimeout(() => {
                this._isScrolling = false;
            }, 100);
        },
        
        generateChartData: function () {
            const rounds = this.data.rounds || [];
            const players = this.data.players || [];

            if (players.length === 0) return;

            // 1. Calculate Cumulative Scores
            const playerScores = {};
            players.forEach(p => playerScores[p.id] = [0]);

            const sortedRounds = [...rounds].sort((a, b) => a.timestamp - b.timestamp);

            sortedRounds.forEach(round => {
                players.forEach(p => {
                    const currentTotal = playerScores[p.id][playerScores[p.id].length - 1];
                    const change = (round.scores && round.scores[p.id]) || 0;
                    playerScores[p.id].push(currentTotal + change);
                });
            });

            // 2. Find Min/Max
            let min = 0;
            let max = 0;
            Object.values(playerScores).forEach(scores => {
                scores.forEach(s => {
                    if (s < min) min = s;
                    if (s > max) max = s;
                });
            });

            let padding = (max - min) * 0.1;
            if (padding === 0) padding = 10;
            const finalMin = min - padding;
            const finalMax = max + padding;

            // 3. Construct SVG String
            const minWidth = 350; // Minimum width to fill container
            const step = 40;      // 40px width per round

            // Calculate Content Width (Where lines are drawn)
            const contentWidth = Math.max(minWidth, sortedRounds.length * step);
            // Add Right Padding for Avatar (10px extends beyond point, reserve 25px safe zone)
            const paddingRight = 25;

            const width = contentWidth + paddingRight; // Total SVG Width
            const height = this.data.height;

            // Distribute points along contentWidth
            // Correction: There are N rounds, so N+1 points (0 to N).
            // Default 0 is index 0. Round 1 is index 1.
            // We want the last point (index N) to be at contentWidth.
            // So: N * xStep = contentWidth  =>  xStep = contentWidth / N.
            const xStep = contentWidth / (sortedRounds.length > 0 ? sortedRounds.length : 1);

            let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

            // --- A. Grid Lines (5 Steps) ---
            const range = finalMax - finalMin;
            const steps = 5;
            for (let i = 0; i <= steps; i++) {
                const val = finalMin + (range * i / steps);
                const y = height - ((val - finalMin) / range) * height;
                // Don't draw if out of bounds (safety)
                if (y >= 0 && y <= height) {
                    svgContent += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e5e7eb" stroke-width="1" />`;
                }
            }

            // --- Helper: Catmull-Rom Spline to Path 'd' ---
            const getSmoothPath = (points) => {
                if (points.length < 2) return "";
                if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

                let d = `M ${points[0].x} ${points[0].y}`;

                for (let i = 0; i < points.length - 1; i++) {
                    const p0 = points[i === 0 ? 0 : i - 1];
                    const p1 = points[i];
                    const p2 = points[i + 1];
                    const p3 = points[i + 2] || p2; // Duplicate last for end

                    const cp1x = p1.x + (p2.x - p0.x) / 6;
                    const cp1y = p1.y + (p2.y - p0.y) / 6;

                    const cp2x = p2.x - (p3.x - p1.x) / 6;
                    const cp2y = p2.y - (p3.y - p1.y) / 6;

                    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                }
                return d;
            };

            // --- B. Player Lines & Dots ---
            const legendPaths = [];
            const avatarMarkers = [];

            players.forEach((p, index) => {
                const scores = playerScores[p.id];
                const color = this.data.colors[index % this.data.colors.length];

                // 检查玩家是否已退出
                const hasLeft = p.hasLeft === true;

                // 已退出玩家使用灰色虚线
                const lineColor = hasLeft ? '#9ca3af' : color;
                const lineStyle = hasLeft ? 'stroke-dasharray="5,5"' : '';
                const dotColor = hasLeft ? '#e5e7eb' : 'white';

                // Calculate Points
                const pointsObj = scores.map((score, i) => {
                    const x = i * xStep;
                    const y = height - ((score - finalMin) / range) * height;
                    return { x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)) };
                });

                // 1. Draw Smooth Path
                const d = getSmoothPath(pointsObj);
                svgContent += `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="2" ${lineStyle} stroke-linecap="round" stroke-linejoin="round" />`;

                // 2. Draw Dots
                pointsObj.forEach(pt => {
                    svgContent += `<circle cx="${pt.x}" cy="${pt.y}" r="3" fill="${dotColor}" stroke="${lineColor}" stroke-width="2" />`;
                });

                // 3. Capture Last Point for Avatar Marker
                const lastPoint = pointsObj[pointsObj.length - 1];
                if (lastPoint) {
                    avatarMarkers.push({
                        id: p.id,
                        avatar: p.avatarUrl || '', // Fallback
                        x: lastPoint.x,
                        y: lastPoint.y,
                        color: lineColor, // 使用 lineColor（已退出为灰色）
                        name: p.name, // Optional for debug or potential tooltip
                        hasLeft: hasLeft // 添加已退出状态
                    });
                }

                legendPaths.push({
                    id: p.id,
                    name: p.name,
                    avatar: p.avatarUrl, // Added for Legend
                    color: color,
                    lastScore: scores[scores.length - 1],
                    hasLeft: hasLeft // 添加已退出状态
                });
            });

            svgContent += `</svg>`;

            // Encode
            // We verify Base64 support. Native implementation: wx.arrayBufferToBase64 usually for buffer.
            // For simple string, explicit implementation or checking environment works.
            // Since this is JS env, standard btoa might not exist in generic wxs/mini-program jsCore.
            // However, most modern environments support it. If not, we use a simple pollyfill or buffer.
            // Safest: use wx.arrayBufferToBase64 with TextEncoder if available, OR simple Base64 helper.
            // Actually, for SVG data URI, we can URL Encode it! 'data:image/svg+xml;utf8,...' works in some WebViews but fails in others (iOS issue).
            // Base64 is safest.
            const base64 = this.utf8_to_b64(svgContent);
            const url = 'data:image/svg+xml;base64,' + base64;

            // --- Collision Handling: Horizontal Stacking (Leftward) ---
            // Sort by Y Descending to group close scores
            avatarMarkers.sort((a, b) => b.y - a.y || (a.id > b.id ? 1 : -1));

            for (let i = 1; i < avatarMarkers.length; i++) {
                const prev = avatarMarkers[i - 1];
                const curr = avatarMarkers[i];

                // If vertical gap is small (Collision or near-collision)
                if (Math.abs(prev.y - curr.y) < 15) {
                    // Shift current LEFT (Decrease X) to stack horizontally
                    // This creates a card-stack effect to the left of the actual data point
                    curr.x = prev.x - 15;
                }
            }

            this.setData({
                chartUrl: url,
                chartWidth: width,
                paths: legendPaths, // Keep for legend
                avatarMarkers: avatarMarkers,
                minScore: Math.round(finalMin),
                maxScore: Math.round(finalMax)
            });
        },

        // Compatible Base64 Encoder
        utf8_to_b64(str) {
            // 1. Encode UTF-8 characters to percent-encoded ASCII
            const encoded = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
                function toSolidBytes(match, p1) {
                    return String.fromCharCode('0x' + p1);
                });

            // 2. Convert binary string to ArrayBuffer
            const buffer = new ArrayBuffer(encoded.length);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < encoded.length; i++) {
                view[i] = encoded.charCodeAt(i);
            }

            // 3. Use Native API
            return wx.arrayBufferToBase64(buffer);
        }
    }
});
