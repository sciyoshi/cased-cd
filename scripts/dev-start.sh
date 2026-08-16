#!/bin/bash
set -e

echo "🚀 Starting Cased CD Development Environment"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required (you have v$NODE_VERSION)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is unavailable. Run 'corepack enable' first."
    exit 1
fi

# Install dependencies if a pnpm installation doesn't exist
if [ ! -d "node_modules/.pnpm" ]; then
    echo "📦 Installing dependencies..."
    pnpm install --frozen-lockfile
    echo ""
else
    echo "✅ Dependencies already installed"
    echo ""
fi

# Check if mock server is already running
if lsof -i:3000 &> /dev/null; then
    echo "⚠️  Port 3000 is already in use. Stopping existing process..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Check if dev server is already running
if lsof -i:5173 &> /dev/null; then
    echo "⚠️  Port 5173 is already in use. Stopping existing process..."
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

echo "🎭 Starting mock API server on port 3000..."
pnpm dev:mock > /tmp/cased-cd-mock.log 2>&1 &
MOCK_PID=$!

# Wait for mock server to be ready
echo "   Waiting for mock server to start..."
for i in {1..10}; do
    if curl -fsS http://localhost:3000/api/v1/settings > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

if ! curl -fsS http://localhost:3000/api/v1/settings > /dev/null 2>&1; then
    echo "❌ Mock server failed to start. Check logs:"
    cat /tmp/cased-cd-mock.log
    exit 1
fi

echo "✅ Mock server running (PID: $MOCK_PID)"
echo ""

echo "🌐 Starting Vite dev server on port 5173..."
pnpm dev > /tmp/cased-cd-vite.log 2>&1 &
VITE_PID=$!

# Wait for vite to be ready
echo "   Waiting for Vite to start..."
for i in {1..20}; do
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "❌ Vite server failed to start. Check logs:"
    cat /tmp/cased-cd-vite.log
    kill $MOCK_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Vite server running (PID: $VITE_PID)"
echo ""

echo "==========================================="
echo "✨ Cased CD is ready!"
echo "==========================================="
echo ""
echo "🌐 Open your browser to: http://localhost:5173"
echo ""
echo "🔑 Mock login: admin / demo"
echo ""
echo "📋 To stop both servers, run:"
echo "   kill $MOCK_PID $VITE_PID"
echo ""
echo "📝 Logs:"
echo "   Mock API: tail -f /tmp/cased-cd-mock.log"
echo "   Vite:     tail -f /tmp/cased-cd-vite.log"
echo ""

# Save PIDs to file for easy cleanup
echo "$MOCK_PID $VITE_PID" > /tmp/cased-cd-pids.txt

# Keep script running and tail logs
echo "📖 Tailing logs (Ctrl+C to stop)..."
echo ""
tail -f /tmp/cased-cd-mock.log /tmp/cased-cd-vite.log
