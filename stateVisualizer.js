class StateVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.states = [];
        this.transitions = [];
        this.startState = null;
        this.acceptStates = new Set();
        this.mode = 'view'; // 'view', 'addState', 'addTransition'
        this.selectedStates = [];
        this.animationSpeed = 1000; // ms per step
        this.isAnimating = false;
        this.currentAnimationStep = 0;
        this.animationPath = [];
        
        // Drag functionality
        this.isDragging = false;
        this.dragState = null;
        this.dragOffset = { x: 0, y: 0 };
        this.lastMousePos = { x: 0, y: 0 };
        
        // Inline editing
        this.editingTransition = null;
        this.editInput = null;
        
        // State label editing
        this.editingState = null;
        this.stateEditInput = null;
        
        // Rectangle selection
        this.isRectangleSelecting = false;
        this.rectangleStart = { x: 0, y: 0 };
        this.rectangleEnd = { x: 0, y: 0 };
        this.selectedElements = new Set(); // Contains both states and transitions
        this.justFinishedSelection = false; // Flag to prevent immediate state creation after selection
        this.dragStarted = false; // Flag to track if we actually started dragging
        this.minDragDistance = 5; // Minimum pixels to consider it a drag operation
        this.lastMouseUpTime = 0; // Track when mouse was last released
        
        // Current mouse position for hotkey operations
        this.currentMousePos = { x: 0, y: 0 };
        this.showStatePreview = false; // Show preview of where state would be created
        this.previewUpdateTimeout = null; // Throttle preview updates
        
        // Undo functionality
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        this.isUndoing = false; // Flag to prevent saving state during undo operations
        
        // Hotkey transition creation
        this.quickTransitionFirstState = null;
        this.isQuickTransitionMode = false;
        
        // Zoom and pan functionality
        this.zoom = 1.0; // Current zoom level
        this.minZoom = 0.1; // Minimum zoom level
        this.maxZoom = 5.0; // Maximum zoom level
        this.panOffset = { x: 0, y: 0 }; // Pan offset
        this.isPanning = false; // Whether we're currently panning
        this.panStart = { x: 0, y: 0 }; // Starting position for pan
        
        this.setupEventListeners();
        this.draw();
        
        // Save initial state for undo functionality
        this.saveState('initial state');
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    }

    handleMouseDown(event) {
        if (this.isAnimating) return;
        
        const mousePos = this.getMousePosition(event);
        const x = mousePos.x;
        const y = mousePos.y;

        const clickedState = this.getStateAt(x, y);
        const clickedTransition = this.getTransitionAt(x, y);
        
        if (clickedState && this.mode === 'view') {
            // Check if state is already selected for group dragging
            if (this.selectedElements.has(clickedState)) {
                // Start group drag
                this.isDragging = true;
                this.dragState = clickedState;
                this.dragOffset.x = x - clickedState.x;
                this.dragOffset.y = y - clickedState.y;
                this.lastMousePos.x = x;
                this.lastMousePos.y = y;
                this.canvas.style.cursor = 'grabbing';
            } else {
                // Clear selection and start single state drag
                if (!event.ctrlKey) {
                    this.selectedElements.clear();
                }
                this.selectedElements.add(clickedState);
                this.isDragging = true;
                this.dragState = clickedState;
                this.dragOffset.x = x - clickedState.x;
                this.dragOffset.y = y - clickedState.y;
                this.lastMousePos.x = x;
                this.lastMousePos.y = y;
                this.canvas.style.cursor = 'grabbing';
            }
            event.preventDefault();
        } else if (!clickedState && !clickedTransition && this.mode === 'view') {
            // Start rectangle selection only in view mode
            this.isRectangleSelecting = true;
            this.dragStarted = false; // Reset drag flag
            
            // Store both screen and world coordinates for selection
            const rect = this.canvas.getBoundingClientRect();
            const screenX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
            const screenY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
            
            this.rectangleStart.x = x; // World coordinates for selection logic
            this.rectangleStart.y = y;
            this.rectangleEnd.x = x;
            this.rectangleEnd.y = y;
            
            this.rectangleStartScreen = { x: screenX, y: screenY }; // Screen coordinates for drawing
            this.rectangleEndScreen = { x: screenX, y: screenY };
            
            // Clear selection if not holding Ctrl
            if (!event.ctrlKey) {
                this.selectedElements.clear();
            }
            
            this.canvas.style.cursor = 'crosshair';
            event.preventDefault();
        }
    }

    handleMouseUp(event) {
        if (this.isRectangleSelecting) {
            // Only perform selection if we actually dragged
            if (this.dragStarted) {
                // Finish rectangle selection
                this.finishRectangleSelection();
                this.justFinishedSelection = true; // Set flag to prevent immediate state creation
                
                // Clear the flag after a short delay
                setTimeout(() => {
                    this.justFinishedSelection = false;
                }, 50);
            } else {
                // Not enough movement - treat as a click, clear selection if not holding Ctrl
                if (!event.ctrlKey) {
                    this.selectedElements.clear();
                }
            }
            
            this.isRectangleSelecting = false;
            this.dragStarted = false;
            this.canvas.style.cursor = 'crosshair';
            this.draw();
            this.lastMouseUpTime = Date.now(); // Track mouse up time
            return;
        }
        
        if (this.isDragging) {
            // Save state for undo (only if states actually moved)
            this.saveState('move states');
            
            this.isDragging = false;
            this.dragState = null;
            this.canvas.style.cursor = 'crosshair';
            
            // Update status
            const selectedCount = Array.from(this.selectedElements).filter(el => el.x !== undefined).length;
            if (selectedCount > 1) {
                this.updateStatus(`Moved ${selectedCount} selected states`);
            } else {
                this.updateStatus('State repositioned');
            }
        }
    }

    finishRectangleSelection() {
        const minX = Math.min(this.rectangleStart.x, this.rectangleEnd.x);
        const maxX = Math.max(this.rectangleStart.x, this.rectangleEnd.x);
        const minY = Math.min(this.rectangleStart.y, this.rectangleEnd.y);
        const maxY = Math.max(this.rectangleStart.y, this.rectangleEnd.y);
        
        // Select states within rectangle
        for (const state of this.states) {
            if (state.x >= minX && state.x <= maxX && state.y >= minY && state.y <= maxY) {
                this.selectedElements.add(state);
            }
        }
        
        // Select transitions whose labels are within rectangle
        for (const transition of this.transitions) {
            const labelPos = this.getTransitionLabelPosition(transition);
            if (labelPos && labelPos.x >= minX && labelPos.x <= maxX && labelPos.y >= minY && labelPos.y <= maxY) {
                this.selectedElements.add(transition);
            }
        }
        
        const selectedStates = Array.from(this.selectedElements).filter(el => el.x !== undefined).length;
        const selectedTransitions = Array.from(this.selectedElements).filter(el => el.from !== undefined).length;
        
        if (selectedStates > 0 || selectedTransitions > 0) {
            this.updateStatus(`Rectangle selection: ${selectedStates} states and ${selectedTransitions} transitions selected`);
        } else {
            this.updateStatus('Rectangle selection: no elements in selection area');
        }
    }

    handleMouseMove(event) {
        const mousePos = this.getMousePosition(event);
        const x = mousePos.x;
        const y = mousePos.y;

        // Update current mouse position for hotkey operations
        this.currentMousePos.x = x;
        this.currentMousePos.y = y;

        if (this.isRectangleSelecting) {
            // Check if we've moved enough to consider this a drag
            const deltaX = Math.abs(x - this.rectangleStart.x);
            const deltaY = Math.abs(y - this.rectangleStart.y);
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (distance >= this.minDragDistance) {
                this.dragStarted = true;
            }
            
            // Update rectangle selection (both world and screen coordinates)
            this.rectangleEnd.x = x;
            this.rectangleEnd.y = y;
            
            // Update screen coordinates for drawing
            const rect = this.canvas.getBoundingClientRect();
            const screenX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
            const screenY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
            this.rectangleEndScreen = { x: screenX, y: screenY };
            
            this.draw();
            return;
        }

        if (this.isDragging && this.dragState) {
            // Calculate movement delta
            const deltaX = x - this.lastMousePos.x;
            const deltaY = y - this.lastMousePos.y;
            
            // Move all selected states
            for (const element of this.selectedElements) {
                if (element.x !== undefined && element.y !== undefined) { // It's a state
                    const newX = element.x + deltaX;
                    const newY = element.y + deltaY;
                    
                    // Keep state within canvas bounds
                    const margin = element.radius;
                    element.x = Math.max(margin, Math.min(this.canvas.width - margin, newX));
                    element.y = Math.max(margin, Math.min(this.canvas.height - margin, newY));
                }
            }
            
            this.lastMousePos.x = x;
            this.lastMousePos.y = y;
            
            // Redraw canvas
            this.draw();
            return;
        }

        // Enhanced hover logic with hotkey cursors
        const hoveredState = this.getStateAt(x, y);
        const hoveredTransition = this.getTransitionAt(x, y);
        
        // Update state preview visibility
        if (!hoveredState && !hoveredTransition && this.mode === 'view' && !this.isRectangleSelecting && !this.isDragging) {
            // Show preview in view mode when hovering over empty space
            const previousPreview = this.showStatePreview;
            this.showStatePreview = true;
            
            // Throttled redraw if preview state changed
            if (previousPreview !== this.showStatePreview) {
                if (this.previewUpdateTimeout) {
                    clearTimeout(this.previewUpdateTimeout);
                }
                this.previewUpdateTimeout = setTimeout(() => {
                    this.draw();
                }, 16); // ~60fps
            }
        } else {
            const previousPreview = this.showStatePreview;
            this.showStatePreview = false;
            
            // Throttled redraw if preview state changed
            if (previousPreview !== this.showStatePreview) {
                if (this.previewUpdateTimeout) {
                    clearTimeout(this.previewUpdateTimeout);
                }
                this.previewUpdateTimeout = setTimeout(() => {
                    this.draw();
                }, 16); // ~60fps
            }
        }

        // Check for hotkey combinations with states
        if (hoveredState) {
            if (event.ctrlKey) {
                if (this.isQuickTransitionMode) {
                    this.canvas.style.cursor = 'copy'; // Different cursor for second click
                } else {
                    this.canvas.style.cursor = 'crosshair'; // Cursor for first click
                }
            } else if (event.shiftKey) {
                this.canvas.style.cursor = 'pointer'; // Cursor for toggling accept state
            } else if (event.altKey) {
                this.canvas.style.cursor = 'not-allowed'; // Cursor for delete
            } else if (this.mode === 'view' && !this.isDragging) {
                this.canvas.style.cursor = 'grab';
            } else if (this.mode !== 'view') {
                this.canvas.style.cursor = 'pointer';
            }
        } else if (this.mode === 'view' && hoveredTransition && !hoveredState) {
            this.canvas.style.cursor = 'text';
        } else {
            this.canvas.style.cursor = 'crosshair';
        }
    }

    handleCanvasClick(event) {
        // Don't handle click if we just finished dragging, rectangle selecting, or just finished selection
        if (this.isDragging || this.isRectangleSelecting || this.justFinishedSelection) return;
        
        // Add a small delay check to prevent clicks immediately after mouse operations
        const timeSinceMouseUp = Date.now() - this.lastMouseUpTime;
        if (timeSinceMouseUp < 10) return; // 10ms delay
        
        const mousePos = this.getMousePosition(event);
        const x = mousePos.x;
        const y = mousePos.y;

        const clickedState = this.getStateAt(x, y);
        const clickedTransition = this.getTransitionAt(x, y);

        // Handle Ctrl+click for quick transition creation
        if (event.ctrlKey && clickedState && !event.shiftKey && !event.altKey) {
            // Check if this is for multi-selection or quick transition
            if (this.quickTransitionFirstState) {
                this.handleQuickTransition(clickedState);
                return;
            } else {
                // Multi-selection: toggle element in selection
                if (this.selectedElements.has(clickedState)) {
                    this.selectedElements.delete(clickedState);
                } else {
                    this.selectedElements.add(clickedState);
                }
                this.draw();
                return;
            }
        }

        // Handle Shift+click for toggling accepting state
        if (event.shiftKey && clickedState) {
            this.toggleAcceptingState(clickedState);
            return;
        }

        // Handle Alt+click for deleting state
        if (event.altKey && clickedState) {
            this.deleteState(clickedState);
            return;
        }

        if (this.mode === 'addState') {
            if (!clickedState) {
                this.addState(x, y);
            }
        } else if (this.mode === 'addTransition') {
            if (clickedState) {
                this.selectedStates.push(clickedState);
                if (this.selectedStates.length === 2) {
                    this.addTransition();
                    this.selectedStates = [];
                    this.mode = 'view';
                }
            }
        } else if (this.mode === 'view') {
            if (clickedTransition && !clickedState) {
                // Edit transition when clicked in view mode
                this.editTransition(clickedTransition);
            } else if (clickedState) {
                // Single click on state - select only this state (unless Ctrl is held)
                if (!event.ctrlKey) {
                    this.selectedElements.clear();
                    this.selectedElements.add(clickedState);
                }
            } else if (!clickedState && !clickedTransition) {
                // Click on blank canvas - only create state if we're sure it's an intentional click
                // (not the result of a failed rectangle selection)
                if (!event.ctrlKey) {
                    this.selectedElements.clear();
                }
                
                // Only create state if we're in view mode and it's a clean click
                if (this.mode === 'view') {
                    this.addState(x, y);
                }
            }
        }

        this.draw();
    }

    handleContextMenu(event) {
        event.preventDefault();
        const mousePos = this.getMousePosition(event);
        const x = mousePos.x;
        const y = mousePos.y;

        const clickedState = this.getStateAt(x, y);
        const clickedTransition = this.getTransitionAt(x, y);
        
        // Check if we have selected elements and are right-clicking on one of them or empty space
        if (this.selectedElements.size > 0) {
            const clickedOnSelected = clickedState && this.selectedElements.has(clickedState);
            const clickedOnSelectedTransition = clickedTransition && this.selectedElements.has(clickedTransition);
            
            if (clickedOnSelected || clickedOnSelectedTransition || (!clickedState && !clickedTransition)) {
                // Show selection context menu
                this.showSelectionMenu(event.clientX, event.clientY);
                return;
            }
        }
        
        // Show individual state menu if clicking on a state
        if (clickedState) {
            this.showStateMenu(clickedState, event.clientX, event.clientY);
        }
    }

    handleDoubleClick(event) {
        if (this.isAnimating) return;
        
        const mousePos = this.getMousePosition(event);
        const x = mousePos.x;
        const y = mousePos.y;

        const clickedState = this.getStateAt(x, y);
        if (clickedState) {
            this.editStateLabel(clickedState);
        }
    }

    handleQuickTransition(clickedState) {
        if (!this.quickTransitionFirstState) {
            // First state clicked - store it and wait for second click
            this.quickTransitionFirstState = clickedState;
            this.isQuickTransitionMode = true;
            this.updateStatus(`Quick transition: Selected ${clickedState.label}, Ctrl+click another state to create transition`);
            
            // Highlight the selected state
            this.selectedStates = [clickedState];
            this.draw();
        } else {
            // Second state clicked - create transition
            const fromState = this.quickTransitionFirstState;
            const toState = clickedState;
            
            // Create the transition
            const transition = {
                from: fromState,
                to: toState,
                symbols: ['a'],
                curved: fromState === toState ? true : this.calculateCurve(fromState, toState)
            };

            this.transitions.push(transition);
            this.updateStatus(`Quick transition created: ${fromState.label} → ${toState.label} on "a" (click transition to edit)`);
            
            // Reset quick transition mode
            this.quickTransitionFirstState = null;
            this.isQuickTransitionMode = false;
            this.selectedStates = [];
            this.draw();
        }
    }

    addState(x, y) {
        // Save state before making changes
        this.saveState('add state');
        
        const stateId = this.states.length;
        const state = {
            id: stateId,
            label: `q${stateId}`,
            x: x,
            y: y,
            radius: 30,
            isStart: this.states.length === 0, // First state is start state
            isAccept: false
        };

        if (state.isStart) {
            this.startState = state;
        }

        this.states.push(state);
        this.updateStatus(`Added state ${state.label}`);
        
        // Automatically exit "Add State" mode and reset button
        this.setMode('view');
        this.resetAddStateButton();
    }

    // Add state at current mouse position (for hotkey)
    addStateAtMouse() {
        // Check if there's already a state at this position
        const existingState = this.getStateAt(this.currentMousePos.x, this.currentMousePos.y);
        if (existingState) {
            this.updateStatus('Cannot create state: position already occupied');
            return false;
        }

        this.addState(this.currentMousePos.x, this.currentMousePos.y);
        this.draw();
        return true;
    }

    resetAddStateButton() {
        const addStateBtn = document.getElementById('add-state-btn');
        if (addStateBtn) {
            addStateBtn.textContent = '➕ Add State';
            addStateBtn.style.background = '#57a0ab';
        }
    }

    addTransition() {
        if (this.selectedStates.length !== 2) return;

        // Save state before making changes
        this.saveState('add transition');

        const from = this.selectedStates[0];
        const to = this.selectedStates[1];
        
        // Automatically assign 'a' as the transition symbol
        const transition = {
            from: from,
            to: to,
            symbols: ['a'],
            curved: from === to ? true : this.calculateCurve(from, to)
        };

        this.transitions.push(transition);
        this.updateStatus(`Added transition ${from.label} → ${to.label} on "a" (click transition to edit)`);
    }

    calculateCurve(from, to) {
        // Check if there's already a transition between these states
        const existingTransition = this.transitions.find(t => 
            (t.from === to && t.to === from) || (t.from === from && t.to === to)
        );
        return existingTransition ? true : false;
    }

    getStateAt(x, y) {
        return this.states.find(state => {
            const dx = x - state.x;
            const dy = y - state.y;
            return Math.sqrt(dx * dx + dy * dy) <= state.radius;
        });
    }

    getTransitionAt(x, y) {
        const tolerance = 15; // Pixel tolerance for clicking near transition labels
        
        for (const transition of this.transitions) {
            const labelPos = this.getTransitionLabelPosition(transition);
            if (labelPos) {
                const dx = x - labelPos.x;
                const dy = y - labelPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= tolerance) {
                    return transition;
                }
            }
        }
        return null;
    }

    getTransitionLabelPosition(transition) {
        const from = transition.from;
        const to = transition.to;

        if (from === to) {
            // Self-loop
            const loopRadius = 25;
            const centerX = from.x;
            const centerY = from.y - from.radius - loopRadius;
            return { x: centerX, y: centerY - loopRadius - 15 };
        } else if (transition.curved) {
            // Curved transition
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const controlX = (from.x + to.x) / 2 + dy * 0.3;
            const controlY = (from.y + to.y) / 2 - dx * 0.3;
            return { x: controlX, y: controlY - 10 };
        } else {
            // Straight transition
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const startX = from.x + from.radius * Math.cos(angle);
            const startY = from.y + from.radius * Math.sin(angle);
            const endX = to.x - to.radius * Math.cos(angle);
            const endY = to.y - to.radius * Math.sin(angle);
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            return { x: midX, y: midY - 15 };
        }
    }

    editTransition(transition) {
        if (this.editingTransition) {
            this.finishEditing();
        }
        
        this.editingTransition = transition;
        const labelPos = this.getTransitionLabelPosition(transition);
        
        if (labelPos) {
            this.createInlineEditor(labelPos.x, labelPos.y, transition.symbols.join(', '));
        }
    }

    createInlineEditor(x, y, currentText) {
        // Create input element
        this.editInput = document.createElement('input');
        this.editInput.type = 'text';
        this.editInput.value = currentText;
        this.editInput.style.position = 'absolute';
        this.editInput.style.background = '#1f1f1f';
        this.editInput.style.color = '#F5F5F5';
        this.editInput.style.border = '2px solid #57a0ab';
        this.editInput.style.borderRadius = '4px';
        this.editInput.style.padding = '4px 8px';
        this.editInput.style.fontSize = '14px';
        this.editInput.style.fontFamily = '"IBM Plex Sans", Arial, sans-serif';
        this.editInput.style.textAlign = 'center';
        this.editInput.style.minWidth = '40px';
        this.editInput.style.zIndex = '1000';
        this.editInput.style.outline = 'none';
        
        // Position the input over the canvas
        const canvasRect = this.canvas.getBoundingClientRect();
        const inputX = canvasRect.left + (x * canvasRect.width / this.canvas.width) - 25;
        const inputY = canvasRect.top + (y * canvasRect.height / this.canvas.height) - 12;
        
        this.editInput.style.left = inputX + 'px';
        this.editInput.style.top = inputY + 'px';
        
        // Add to document
        document.body.appendChild(this.editInput);
        
        // Focus and select all text
        this.editInput.focus();
        this.editInput.select();
        
        // Event listeners
        this.editInput.addEventListener('blur', () => {
            this.finishEditing();
        });
        
        this.editInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.finishEditing();
            } else if (event.key === 'Escape') {
                this.cancelEditing();
            }
        });
        
        // Auto-resize input based on content
        this.editInput.addEventListener('input', () => {
            this.autoResizeInput();
        });
        
        this.autoResizeInput();
    }

    autoResizeInput() {
        if (this.editInput) {
            // Create a temporary span to measure text width
            const span = document.createElement('span');
            span.style.font = this.editInput.style.font;
            span.style.fontSize = this.editInput.style.fontSize;
            span.style.fontFamily = this.editInput.style.fontFamily;
            span.style.visibility = 'hidden';
            span.style.position = 'absolute';
            span.textContent = this.editInput.value || 'a';
            
            document.body.appendChild(span);
            const width = Math.max(40, span.offsetWidth + 20);
            document.body.removeChild(span);
            
            this.editInput.style.width = width + 'px';
            
            // Recenter the input
            const canvasRect = this.canvas.getBoundingClientRect();
            const labelPos = this.getTransitionLabelPosition(this.editingTransition);
            const inputX = canvasRect.left + (labelPos.x * canvasRect.width / this.canvas.width) - (width / 2);
            this.editInput.style.left = inputX + 'px';
        }
    }

    finishEditing() {
        if (this.editInput && this.editingTransition) {
            const newValue = this.editInput.value.trim();
            
            if (newValue !== '') {
                // Save state before making changes
                this.saveState('edit transition');
                
                const symbols = newValue.split(',').map(s => s.trim()).filter(s => s !== '');
                if (symbols.length > 0) {
                    this.editingTransition.symbols = symbols;
                    this.updateStatus(`Updated transition ${this.editingTransition.from.label} → ${this.editingTransition.to.label} to "${symbols.join(', ')}"`);
                } else {
                    this.editingTransition.symbols = ['a']; // Fallback
                }
            } else {
                this.editingTransition.symbols = ['a']; // Fallback for empty input
            }
            
            this.cleanupEditor();
            this.draw();
        }
    }

    cancelEditing() {
        this.cleanupEditor();
    }

    cleanupEditor() {
        if (this.editInput) {
            document.body.removeChild(this.editInput);
            this.editInput = null;
        }
        this.editingTransition = null;
    }

    showStateMenu(state, x, y) {
        const menu = document.createElement('div');
        menu.style.position = 'absolute';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.background = '#2a2a2a';
        menu.style.color = '#F5F5F5';
        menu.style.border = '1px solid #57a0ab';
        menu.style.borderRadius = '5px';
        menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        menu.style.padding = '8px 0';
        menu.style.zIndex = '1000';
        menu.style.fontFamily = '"IBM Plex Sans", Arial, sans-serif';
        menu.style.fontSize = '14px';
        menu.style.minWidth = '160px';

        const toggleStart = document.createElement('div');
        toggleStart.textContent = state.isStart ? '🏁 Remove Start' : '▶️ Set as Start';
        toggleStart.style.padding = '8px 16px';
        toggleStart.style.cursor = 'pointer';
        toggleStart.style.borderBottom = '1px solid #444';
        toggleStart.onmouseover = () => toggleStart.style.background = '#57a0ab';
        toggleStart.onmouseout = () => toggleStart.style.background = 'transparent';
        toggleStart.onclick = () => {
            this.saveState('toggle start state');
            if (state.isStart) {
                state.isStart = false;
                this.startState = null;
            } else {
                // Remove start from other states
                this.states.forEach(s => s.isStart = false);
                state.isStart = true;
                this.startState = state;
            }
            document.body.removeChild(menu);
            this.draw();
        };

        const toggleAccept = document.createElement('div');
        toggleAccept.textContent = state.isAccept ? '➖ Remove Accept' : '✅ Set as Accept';
        toggleAccept.style.padding = '8px 16px';
        toggleAccept.style.cursor = 'pointer';
        toggleAccept.style.borderBottom = '1px solid #444';
        toggleAccept.onmouseover = () => toggleAccept.style.background = '#57a0ab';
        toggleAccept.onmouseout = () => toggleAccept.style.background = 'transparent';
        toggleAccept.onclick = () => {
            this.toggleAcceptingState(state);
            document.body.removeChild(menu);
        };

        const editLabel = document.createElement('div');
        editLabel.textContent = '✏️ Edit Label';
        editLabel.style.padding = '8px 16px';
        editLabel.style.cursor = 'pointer';
        editLabel.onmouseover = () => editLabel.style.background = '#57a0ab';
        editLabel.onmouseout = () => editLabel.style.background = 'transparent';
        editLabel.onclick = () => {
            this.editStateLabel(state);
            document.body.removeChild(menu);
        };

        menu.appendChild(toggleStart);
        menu.appendChild(toggleAccept);
        menu.appendChild(editLabel);

        document.body.appendChild(menu);

        // Remove menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', function removeMenu() {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                document.removeEventListener('click', removeMenu);
            });
        }, 100);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Save the current context state
        this.ctx.save();
        
        // Apply zoom and pan transformations
        this.ctx.translate(this.panOffset.x, this.panOffset.y);
        this.ctx.scale(this.zoom, this.zoom);
        
        // Draw transitions first (behind states)
        this.transitions.forEach(transition => this.drawTransition(transition));
        
        // Draw states
        this.states.forEach(state => this.drawState(state));
        
        // Restore the context state
        this.ctx.restore();
        
        // Draw UI elements that should not be affected by zoom/pan
        // Draw selection rectangle if selecting (in screen coordinates)
        if (this.isRectangleSelecting && this.dragStarted) {
            this.drawSelectionRectangle();
        }
        
        // Highlight selected elements (in world coordinates, so apply transform again)
        this.ctx.save();
        this.ctx.translate(this.panOffset.x, this.panOffset.y);
        this.ctx.scale(this.zoom, this.zoom);
        this.drawSelectedElements();
        
        // Draw state preview if enabled (in world coordinates)
        if (this.showStatePreview) {
            this.drawStatePreview();
        }
        this.ctx.restore();
    }

    drawState(state) {
        const ctx = this.ctx;
        const isSelected = this.selectedStates.includes(state);
        const isAnimated = this.animationPath.includes(state) && this.isAnimating;

        // Draw state circle
        ctx.beginPath();
        ctx.arc(state.x, state.y, state.radius, 0, 2 * Math.PI);
        
        // Fill color based on state
        if (isAnimated) {
            ctx.fillStyle = '#57a0ab';
        } else if (isSelected) {
            ctx.fillStyle = '#6bb3bf';
        } else {
            ctx.fillStyle = '#2a2a2a';
        }
        ctx.fill();

        // Border
        ctx.strokeStyle = isAnimated ? '#57a0ab' : (isSelected ? '#6bb3bf' : '#F5F5F5');
        ctx.lineWidth = isAnimated ? 4 : 2;
        ctx.stroke();

        // Double circle for accept states
        if (state.isAccept) {
            ctx.beginPath();
            ctx.arc(state.x, state.y, state.radius - 5, 0, 2 * Math.PI);
            ctx.strokeStyle = isAnimated ? '#57a0ab' : '#F5F5F5';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // State label
        ctx.fillStyle = '#F5F5F5';
        ctx.font = '16px "IBM Plex Sans", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(state.label, state.x, state.y);

        // Start state indicator
        if (state.isStart) {
            this.drawStartArrow(state);
        }
    }

    drawStartArrow(state) {
        const ctx = this.ctx;
        const startX = state.x - state.radius - 40;
        const startY = state.y;
        const endX = state.x - state.radius;
        const endY = state.y;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = '#F5F5F5';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(endY - startY, endX - startX);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 10 * Math.cos(angle - Math.PI/6), endY - 10 * Math.sin(angle - Math.PI/6));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 10 * Math.cos(angle + Math.PI/6), endY - 10 * Math.sin(angle + Math.PI/6));
        ctx.stroke();

        // "Start" label
        ctx.fillStyle = '#F5F5F5';
        ctx.font = '12px "IBM Plex Sans", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Start', startX - 10, startY - 10);
    }

    drawTransition(transition) {
        const ctx = this.ctx;
        const from = transition.from;
        const to = transition.to;
        const isAnimated = this.currentAnimationTransition === transition && this.isAnimating;

        if (from === to) {
            // Self-loop
            this.drawSelfLoop(transition, isAnimated);
        } else if (transition.curved) {
            this.drawCurvedTransition(transition, isAnimated);
        } else {
            this.drawStraightTransition(transition, isAnimated);
        }
    }

    drawStraightTransition(transition, isAnimated = false) {
        const ctx = this.ctx;
        const from = transition.from;
        const to = transition.to;

        // Calculate line endpoints (on circle boundaries)
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const startX = from.x + from.radius * Math.cos(angle);
        const startY = from.y + from.radius * Math.sin(angle);
        const endX = to.x - to.radius * Math.cos(angle);
        const endY = to.y - to.radius * Math.sin(angle);

        // Set colors based on animation state
        const lineColor = isAnimated ? '#57a0ab' : '#F5F5F5';
        const lineWidth = isAnimated ? 4 : 2;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]); // Always solid line
        ctx.stroke();

        // Arrow head with same color as line
        this.drawArrowHead(endX, endY, angle, lineColor, lineWidth);

        // Label
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        this.drawTransitionLabel(transition, midX, midY - 15);
    }

    drawCurvedTransition(transition, isAnimated = false) {
        const ctx = this.ctx;
        const from = transition.from;
        const to = transition.to;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Control point for curve
        const controlX = (from.x + to.x) / 2 + dy * 0.3;
        const controlY = (from.y + to.y) / 2 - dx * 0.3;

        // Calculate start and end points on circle boundaries
        const startAngle = Math.atan2(controlY - from.y, controlX - from.x);
        const endAngle = Math.atan2(controlY - to.y, controlX - to.x) + Math.PI;
        
        const startX = from.x + from.radius * Math.cos(startAngle);
        const startY = from.y + from.radius * Math.sin(startAngle);
        const endX = to.x + to.radius * Math.cos(endAngle);
        const endY = to.y + to.radius * Math.sin(endAngle);

        // Set colors based on animation state
        const lineColor = isAnimated ? '#57a0ab' : '#F5F5F5';
        const lineWidth = isAnimated ? 4 : 2;

        // Draw curved line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, endX, endY);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]); // Always solid line
        ctx.stroke();

        // Arrow head with same color as line
        const arrowAngle = Math.atan2(endY - controlY, endX - controlX);
        this.drawArrowHead(endX, endY, arrowAngle, lineColor, lineWidth);

        // Label
        this.drawTransitionLabel(transition, controlX, controlY - 10);
    }

    drawSelfLoop(transition, isAnimated = false) {
        const ctx = this.ctx;
        const state = transition.from;
        const loopRadius = 25;
        const centerX = state.x;
        const centerY = state.y - state.radius - loopRadius;

        // Set colors based on animation state
        const lineColor = isAnimated ? '#57a0ab' : '#F5F5F5';
        const lineWidth = isAnimated ? 4 : 2;

        // Draw loop - adjusted angles to start and end at proper positions
        ctx.beginPath();
        ctx.arc(centerX, centerY, loopRadius, 0.5 * Math.PI, 2.5 * Math.PI);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]); // Always solid line
        ctx.stroke();

        // Arrow head - positioned at the end of the arc with correct angle
        const arrowAngle = 2.5 * Math.PI; // End angle of the arc
        const arrowX = centerX + loopRadius * Math.cos(arrowAngle);
        const arrowY = centerY + loopRadius * Math.sin(arrowAngle);
        
        // Calculate the tangent angle for the arrow head direction
        const tangentAngle = arrowAngle + Math.PI/2;
        this.drawArrowHead(arrowX, arrowY, tangentAngle, lineColor, lineWidth);

        // Label
        this.drawTransitionLabel(transition, centerX, centerY - loopRadius - 15);
    }

    drawArrowHead(x, y, angle, lineColor = '#F5F5F5', lineWidth = 2) {
        const ctx = this.ctx;
        const headLength = 12;
        
        // Set arrow head color and width to match the line
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - headLength * Math.cos(angle - Math.PI/6), y - headLength * Math.sin(angle - Math.PI/6));
        ctx.moveTo(x, y);
        ctx.lineTo(x - headLength * Math.cos(angle + Math.PI/6), y - headLength * Math.sin(angle + Math.PI/6));
        ctx.stroke();
    }

    drawTransitionLabel(transition, x, y) {
        const ctx = this.ctx;
        const label = transition.symbols.join(', ');
        
        // Set font for measuring
        ctx.font = '14px "IBM Plex Sans", Arial, sans-serif';
        
        // Background for label
        ctx.fillStyle = '#1f1f1f';
        const metrics = ctx.measureText(label);
        ctx.fillRect(x - metrics.width/2 - 3, y - 8, metrics.width + 6, 16);
        
        // Label text
        ctx.fillStyle = '#F5F5F5';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
    }

    // Animation methods
    async animateString(inputString, automatonType = 'dfa') {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.currentAnimationStep = 0;
        this.animationPath = [];
        
        if (automatonType === 'dfa') {
            await this.animateDFA(inputString);
        } else {
            await this.animateNFA(inputString);
        }
        
        this.isAnimating = false;
        this.draw();
    }

    async animateDFA(inputString) {
        let currentState = this.startState;
        if (!currentState) {
            this.updateStatus('No start state defined!');
            return;
        }

        this.updateStatus(`Processing string "${inputString}" with DFA...`);
        this.animationPath = [currentState];
        
        for (let i = 0; i < inputString.length; i++) {
            const symbol = inputString[i];
            
            // Highlight current state
            this.draw();
            await this.sleep(this.animationSpeed);
            
            // Find transition
            const transition = this.transitions.find(t => 
                t.from === currentState && t.symbols.includes(symbol)
            );
            
            if (!transition) {
                this.updateStatus(`❌ No transition from ${currentState.label} on symbol "${symbol}". String rejected!`);
                return;
            }
            
            // Animate transition
            this.currentAnimationTransition = transition;
            this.draw();
            await this.sleep(this.animationSpeed);
            
            currentState = transition.to;
            this.animationPath = [currentState];
        }
        
        // Check if final state is accepting
        const isAccepted = currentState.isAccept;
        this.updateStatus(
            isAccepted 
                ? `✅ String "${inputString}" accepted! Ended in accept state ${currentState.label}` 
                : `❌ String "${inputString}" rejected! Ended in non-accept state ${currentState.label}`
        );
    }

    async animateNFA(inputString) {
        let currentStates = new Set([this.startState]);
        if (!this.startState) {
            this.updateStatus('No start state defined!');
            return;
        }

        this.updateStatus(`Processing string "${inputString}" with NFA...`);
        
        // Add ε-closure of start state
        currentStates = this.epsilonClosure(currentStates);
        this.animationPath = Array.from(currentStates);
        
        for (let i = 0; i < inputString.length; i++) {
            const symbol = inputString[i];
            
            // Highlight current states
            this.draw();
            await this.sleep(this.animationSpeed);
            
            // Find all possible transitions
            const nextStates = new Set();
            for (const state of currentStates) {
                const transitions = this.transitions.filter(t => 
                    t.from === state && t.symbols.includes(symbol)
                );
                transitions.forEach(t => nextStates.add(t.to));
            }
            
            if (nextStates.size === 0) {
                this.updateStatus(`❌ No transitions from current states on symbol "${symbol}". String rejected!`);
                return;
            }
            
            // Add ε-closure
            currentStates = this.epsilonClosure(nextStates);
            this.animationPath = Array.from(currentStates);
        }
        
        // Check if any final state is accepting
        const isAccepted = Array.from(currentStates).some(state => state.isAccept);
        this.updateStatus(
            isAccepted 
                ? `✅ String "${inputString}" accepted! At least one final state is accepting` 
                : `❌ String "${inputString}" rejected! No final state is accepting`
        );
    }

    epsilonClosure(states) {
        const closure = new Set(states);
        const stack = Array.from(states);
        
        while (stack.length > 0) {
            const state = stack.pop();
            const epsilonTransitions = this.transitions.filter(t => 
                t.from === state && (t.symbols.includes('ε') || t.symbols.includes(''))
            );
            
            for (const transition of epsilonTransitions) {
                if (!closure.has(transition.to)) {
                    closure.add(transition.to);
                    stack.push(transition.to);
                }
            }
        }
        
        return closure;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Utility methods
    setMode(mode) {
        this.mode = mode;
        this.selectedStates = [];
        
        // Reset quick transition mode when changing modes
        this.quickTransitionFirstState = null;
        this.isQuickTransitionMode = false;
        
        this.updateStatus(`Mode: ${mode}`);
    }

    clear() {
        // Save state before clearing
        this.saveState('clear diagram');
        
        this.states = [];
        this.transitions = [];
        this.startState = null;
        this.acceptStates.clear();
        this.selectedStates = [];
        this.selectedElements.clear();
        this.mode = 'view';
        this.draw();
        this.updateStatus('Diagram cleared');
    }

    loadExample(type = 'dfa') {
        this.clear();
        
        if (type === 'dfa') {
            // Correct DFA that accepts strings ending with 'ab'
            // q0: initial state (haven't seen 'a' or just saw 'b')
            // q1: just saw 'a' 
            // q2: just saw 'ab' (accept state)
            this.states = [
                { id: 0, label: 'q0', x: 200, y: 200, radius: 30, isStart: true, isAccept: false },
                { id: 1, label: 'q1', x: 400, y: 200, radius: 30, isStart: false, isAccept: false },
                { id: 2, label: 'q2', x: 600, y: 200, radius: 30, isStart: false, isAccept: true }
            ];
            
            this.transitions = [
                // From q0: 'a' goes to q1, 'b' stays in q0
                { from: this.states[0], to: this.states[1], symbols: ['a'], curved: false },
                { from: this.states[0], to: this.states[0], symbols: ['b'], curved: true },
                // From q1: 'a' stays in q1, 'b' goes to q2 (accept)
                { from: this.states[1], to: this.states[1], symbols: ['a'], curved: true },
                { from: this.states[1], to: this.states[2], symbols: ['b'], curved: false },
                // From q2: 'a' goes to q1 (might start new 'ab'), 'b' goes to q0
                { from: this.states[2], to: this.states[1], symbols: ['a'], curved: false },
                { from: this.states[2], to: this.states[0], symbols: ['b'], curved: false }
            ];
            
            this.startState = this.states[0];
            this.acceptStates.add(this.states[2]);
            this.updateStatus('Loaded example DFA: accepts strings ending with "ab"');
        } else {
            // Example NFA
            this.states = [
                { id: 0, label: 'q0', x: 200, y: 200, radius: 30, isStart: true, isAccept: false },
                { id: 1, label: 'q1', x: 400, y: 150, radius: 30, isStart: false, isAccept: false },
                { id: 2, label: 'q2', x: 400, y: 250, radius: 30, isStart: false, isAccept: false },
                { id: 3, label: 'q3', x: 600, y: 200, radius: 30, isStart: false, isAccept: true }
            ];
            
            this.transitions = [
                { from: this.states[0], to: this.states[1], symbols: ['a'], curved: false },
                { from: this.states[0], to: this.states[2], symbols: ['a'], curved: false },
                { from: this.states[1], to: this.states[3], symbols: ['b'], curved: false },
                { from: this.states[2], to: this.states[3], symbols: ['c'], curved: false }
            ];
            
            this.startState = this.states[0];
            this.acceptStates.add(this.states[3]);
            this.updateStatus('Loaded example NFA: accepts "ab" or "ac"');
        }
        
        this.draw();
    }

    // Export methods
    exportAsPNG() {
        const link = document.createElement('a');
        link.download = 'state-diagram.png';
        link.href = this.canvas.toDataURL();
        link.click();
    }

    exportAsSVG() {
        // This would require a more complex implementation
        // For now, we'll export as PNG
        this.exportAsPNG();
    }

    exportAsJSON() {
        const data = {
            states: this.states.map(s => ({
                id: s.id,
                label: s.label,
                x: s.x,
                y: s.y,
                isStart: s.isStart,
                isAccept: s.isAccept
            })),
            transitions: this.transitions.map(t => ({
                fromId: t.from.id,
                toId: t.to.id,
                symbols: t.symbols,
                curved: t.curved
            }))
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.download = 'state-diagram.json';
        link.href = URL.createObjectURL(blob);
        link.click();
    }

    importFromJSON(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            this.clear();
            
            // Recreate states
            this.states = data.states.map(s => ({
                id: s.id,
                label: s.label,
                x: s.x,
                y: s.y,
                radius: 30,
                isStart: s.isStart,
                isAccept: s.isAccept
            }));
            
            // Set start state and accept states
            this.startState = this.states.find(s => s.isStart);
            this.acceptStates.clear();
            this.states.filter(s => s.isAccept).forEach(s => this.acceptStates.add(s));
            
            // Recreate transitions
            this.transitions = data.transitions.map(t => ({
                from: this.states.find(s => s.id === t.fromId),
                to: this.states.find(s => s.id === t.toId),
                symbols: t.symbols,
                curved: t.curved
            }));
            
            this.draw();
            this.updateStatus('Diagram imported successfully');
        } catch (error) {
            this.updateStatus('Error importing diagram: ' + error.message);
        }
    }

    updateStatus(message) {
        const statusElement = document.getElementById('status-text');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    toggleAcceptingState(state) {
        // Save state before making changes
        this.saveState('toggle accepting state');
        
        state.isAccept = !state.isAccept;
        if (state.isAccept) {
            this.acceptStates.add(state);
            this.updateStatus(`✅ ${state.label} is now an accepting state`);
        } else {
            this.acceptStates.delete(state);
            this.updateStatus(`➖ ${state.label} is no longer an accepting state`);
        }
        this.draw();
    }

    deleteState(state) {
        // Check if this is the only state
        if (this.states.length === 1) {
            this.updateStatus(`❌ Cannot delete the last remaining state`);
            return;
        }

        // Save state before making changes
        this.saveState('delete state');

        const stateLabel = state.label;
        
        // Remove the state from the states array
        this.states = this.states.filter(s => s.id !== state.id);
        
        // Remove all transitions involving this state
        const removedTransitions = this.transitions.filter(t => t.from.id === state.id || t.to.id === state.id);
        this.transitions = this.transitions.filter(t => t.from.id !== state.id && t.to.id !== state.id);
        
        // Handle special state properties
        if (state.isStart) {
            this.startState = null;
            this.updateStatus(`🗑️ Deleted start state ${stateLabel} and ${removedTransitions.length} transitions. Set a new start state!`);
        } else {
            this.updateStatus(`🗑️ Deleted state ${stateLabel} and ${removedTransitions.length} transitions`);
        }
        
        // Remove from accept states if it was one
        if (state.isAccept) {
            this.acceptStates.delete(state);
        }
        
        // Clear any selection that might include this state
        this.selectedStates = this.selectedStates.filter(s => s.id !== state.id);
        
        // Reset quick transition mode if it involved this state
        if (this.quickTransitionFirstState && this.quickTransitionFirstState.id === state.id) {
            this.quickTransitionFirstState = null;
            this.isQuickTransitionMode = false;
        }
        
        this.draw();
    }

    // Programmatic diagram creation
    createFromStructure(structure) {
        try {
            // Save state before making changes
            this.saveState('load diagram');
            
            this.clear();
            
            // Validate structure
            if (!structure.states || !Array.isArray(structure.states)) {
                throw new Error('Structure must have a "states" array');
            }
            
            // Create states
            this.states = structure.states.map((stateData, index) => {
                const state = {
                    id: stateData.id !== undefined ? stateData.id : index,
                    label: stateData.label || `q${stateData.id !== undefined ? stateData.id : index}`,
                    x: stateData.x || 200 + (index % 4) * 200,
                    y: stateData.y || 200 + Math.floor(index / 4) * 150,
                    radius: 30,
                    isStart: stateData.isStart || false,
                    isAccept: stateData.isAccept || false
                };
                
                if (state.isStart) {
                    this.startState = state;
                }
                if (state.isAccept) {
                    this.acceptStates.add(state);
                }
                
                return state;
            });
            
            // Create transitions
            if (structure.transitions && Array.isArray(structure.transitions)) {
                this.transitions = structure.transitions.map(transData => {
                    const fromState = this.states.find(s => s.id === transData.from);
                    const toState = this.states.find(s => s.id === transData.to);
                    
                    if (!fromState) {
                        throw new Error(`From state with id ${transData.from} not found`);
                    }
                    if (!toState) {
                        throw new Error(`To state with id ${transData.to} not found`);
                    }
                    
                    return {
                        from: fromState,
                        to: toState,
                        symbols: Array.isArray(transData.symbols) ? transData.symbols : [transData.symbols || 'a'],
                        curved: transData.curved !== undefined ? transData.curved : 
                               (fromState === toState ? true : this.calculateCurve(fromState, toState))
                    };
                });
            }
            
            // Set metadata if provided
            if (structure.metadata) {
                if (structure.metadata.title) {
                    this.updateStatus(`Loaded: ${structure.metadata.title}`);
                }
            } else {
                this.updateStatus(`Programmatically created diagram with ${this.states.length} states and ${this.transitions.length} transitions`);
            }
            
            this.draw();
            return true;
            
        } catch (error) {
            this.updateStatus(`Error creating diagram: ${error.message}`);
            return false;
        }
    }

    // Predefined diagram templates
    static getTemplates() {
        return {
            // DFA that accepts strings ending with 'ab'
            endsWithAB: {
                metadata: { title: "DFA: Strings ending with 'ab'" },
                states: [
                    { id: 0, label: 'q0', x: 200, y: 300, isStart: true },
                    { id: 1, label: 'q1', x: 450, y: 300 },
                    { id: 2, label: 'q2', x: 700, y: 300, isAccept: true }
                ],
                transitions: [
                    // From q0: 'a' goes to q1, 'b' stays in q0
                    { from: 0, to: 1, symbols: ['a'] },
                    { from: 0, to: 0, symbols: ['b'] },
                    // From q1: 'a' stays in q1, 'b' goes to q2 (accept)
                    { from: 1, to: 1, symbols: ['a'] },
                    { from: 1, to: 2, symbols: ['b'] },
                    // From q2: 'a' goes to q1 (might start new 'ab'), 'b' goes to q0
                    { from: 2, to: 1, symbols: ['a'] },
                    { from: 2, to: 0, symbols: ['b'] }
                ]
            },

            // DFA for even number of 0s and 1s
            evenZerosOnes: {
                metadata: { title: "DFA: Even number of 0s and 1s" },
                states: [
                    { id: 0, label: 'q00', x: 300, y: 200, isStart: true, isAccept: true },
                    { id: 1, label: 'q01', x: 600, y: 200 },
                    { id: 2, label: 'q10', x: 300, y: 400 },
                    { id: 3, label: 'q11', x: 600, y: 400 }
                ],
                transitions: [
                    { from: 0, to: 2, symbols: ['0'] },
                    { from: 0, to: 1, symbols: ['1'] },
                    { from: 1, to: 3, symbols: ['0'] },
                    { from: 1, to: 0, symbols: ['1'] },
                    { from: 2, to: 0, symbols: ['0'] },
                    { from: 2, to: 3, symbols: ['1'] },
                    { from: 3, to: 1, symbols: ['0'] },
                    { from: 3, to: 2, symbols: ['1'] }
                ]
            },

            // NFA that accepts strings containing '101'
            contains101: {
                metadata: { title: "NFA: Strings containing '101'" },
                states: [
                    { id: 0, label: 'q0', x: 200, y: 300, isStart: true },
                    { id: 1, label: 'q1', x: 350, y: 300 },
                    { id: 2, label: 'q2', x: 500, y: 300 },
                    { id: 3, label: 'q3', x: 650, y: 300, isAccept: true }
                ],
                transitions: [
                    { from: 0, to: 0, symbols: ['0', '1'] },
                    { from: 0, to: 1, symbols: ['1'] },
                    { from: 1, to: 2, symbols: ['0'] },
                    { from: 2, to: 3, symbols: ['1'] },
                    { from: 3, to: 3, symbols: ['0', '1'] }
                ]
            },

            // Simple binary counter (mod 3)
            binaryMod3: {
                metadata: { title: "DFA: Binary numbers divisible by 3 (complete)" },
                states: [
                    { id: 0, label: 'q0', x: 300, y: 250, isStart: true, isAccept: true },
                    { id: 1, label: 'q1', x: 500, y: 150 },
                    { id: 2, label: 'q2', x: 500, y: 350 }
                ],
                transitions: [
                    { from: 0, to: 0, symbols: ['0'] },
                    { from: 0, to: 1, symbols: ['1'] },
                    { from: 1, to: 2, symbols: ['0'] },
                    { from: 1, to: 0, symbols: ['1'] },
                    { from: 2, to: 1, symbols: ['0'] },
                    { from: 2, to: 2, symbols: ['1'] }
                ]
            },

            // DFA that accepts binary strings ending with '01'
            endsWithBinary01: {
                metadata: { title: "DFA: Binary strings ending with '01'" },
                states: [
                    { id: 0, label: 'q0', x: 200, y: 300, isStart: true },
                    { id: 1, label: 'q1', x: 450, y: 300 },
                    { id: 2, label: 'q2', x: 700, y: 300, isAccept: true }
                ],
                transitions: [
                    // From q0: '0' goes to q1, '1' stays in q0
                    { from: 0, to: 1, symbols: ['0'] },
                    { from: 0, to: 0, symbols: ['1'] },
                    // From q1: '0' stays in q1, '1' goes to q2 (accept)
                    { from: 1, to: 1, symbols: ['0'] },
                    { from: 1, to: 2, symbols: ['1'] },
                    // From q2: '0' goes to q1 (might start new '01'), '1' goes to q0
                    { from: 2, to: 1, symbols: ['0'] },
                    { from: 2, to: 0, symbols: ['1'] }
                ]
            },

            // NFA with epsilon transitions
            epsilonNFA: {
                metadata: { title: "NFA: With epsilon transitions" },
                states: [
                    { id: 0, label: 'q0', x: 200, y: 300, isStart: true },
                    { id: 1, label: 'q1', x: 400, y: 200 },
                    { id: 2, label: 'q2', x: 400, y: 400 },
                    { id: 3, label: 'q3', x: 600, y: 300, isAccept: true }
                ],
                transitions: [
                    { from: 0, to: 1, symbols: ['ε'] },
                    { from: 0, to: 2, symbols: ['ε'] },
                    { from: 1, to: 3, symbols: ['a'] },
                    { from: 2, to: 3, symbols: ['b'] }
                ]
            }
        };
    }

    // Load a predefined template
    loadTemplate(templateName) {
        console.log('loadTemplate called with:', templateName);
        const templates = StateVisualizer.getTemplates();
        console.log('Available templates:', Object.keys(templates));
        if (templates[templateName]) {
            console.log('Template found, creating structure...');
            return this.createFromStructure(templates[templateName]);
        } else {
            console.log('Template not found!');
            this.updateStatus(`Template '${templateName}' not found. Available: ${Object.keys(templates).join(', ')}`);
            return false;
        }
    }

    // Batch testing functionality
    async batchTestStrings(inputStrings, automatonType = 'dfa', showProgress = true) {
        if (this.states.length === 0) {
            throw new Error('No diagram loaded. Please create a diagram first.');
        }

        if (!this.startState) {
            throw new Error('No start state defined. Please set a start state.');
        }

        const results = [];
        const totalTests = inputStrings.length;
        
        for (let i = 0; i < inputStrings.length; i++) {
            const inputString = inputStrings[i].trim();
            
            // Update progress if callback provided
            if (showProgress && window.updateBatchProgress) {
                window.updateBatchProgress(i + 1, totalTests, inputString);
            }
            
            try {
                let isAccepted;
                if (automatonType === 'dfa') {
                    isAccepted = await this.testStringDFA(inputString);
                } else {
                    isAccepted = await this.testStringNFA(inputString);
                }
                
                results.push({
                    string: inputString,
                    accepted: isAccepted,
                    error: null
                });
            } catch (error) {
                results.push({
                    string: inputString,
                    accepted: false,
                    error: error.message
                });
            }
            
            // Small delay to prevent UI blocking
            await this.sleep(10);
        }
        
        return results;
    }

    // Test a string without animation (for batch testing)
    async testStringDFA(inputString) {
        let currentState = this.startState;
        
        for (const symbol of inputString) {
            const transition = this.transitions.find(t => 
                t.from === currentState && t.symbols.includes(symbol)
            );
            
            if (!transition) {
                // Check if this symbol exists anywhere in the DFA
                const symbolExists = this.transitions.some(t => t.symbols.includes(symbol));
                if (!symbolExists) {
                    throw new Error(`Symbol '${symbol}' not in alphabet. Available symbols: ${this.getAlphabet().join(', ')}`);
                }
                return false; // No valid transition, reject
            }
            
            currentState = transition.to;
        }
        
        return this.acceptStates.has(currentState);
    }

    // Helper method to get the alphabet of the current DFA
    getAlphabet() {
        const symbols = new Set();
        this.transitions.forEach(t => {
            t.symbols.forEach(s => symbols.add(s));
        });
        return Array.from(symbols).sort();
    }

    // Test a string in NFA without animation (for batch testing)
    async testStringNFA(inputString) {
        let currentStates = Array.from(this.epsilonClosure([this.startState]));
        
        for (const symbol of inputString) {
            const nextStates = [];
            
            for (const state of currentStates) {
                const transitions = this.transitions.filter(t => 
                    t.from === state && t.symbols.includes(symbol)
                );
                
                for (const transition of transitions) {
                    nextStates.push(transition.to);
                }
            }
            
            if (nextStates.length === 0) {
                // Check if this symbol exists anywhere in the NFA
                const symbolExists = this.transitions.some(t => t.symbols.includes(symbol));
                if (!symbolExists) {
                    throw new Error(`Symbol '${symbol}' not in alphabet. Available symbols: ${this.getAlphabet().join(', ')}`);
                }
                return false; // No valid transitions, reject
            }
            
            currentStates = Array.from(this.epsilonClosure(nextStates));
        }
        
        // Check if any current state is accepting
        return currentStates.some(state => this.acceptStates.has(state));
    }

    editStateLabel(state) {
        if (this.editingState) {
            this.finishStateEditing();
        }
        
        this.editingState = state;
        this.createStateLabelEditor(state.x, state.y, state.label);
    }

    createStateLabelEditor(x, y, currentLabel) {
        // Create input element
        this.stateEditInput = document.createElement('input');
        this.stateEditInput.type = 'text';
        this.stateEditInput.value = currentLabel;
        this.stateEditInput.style.position = 'absolute';
        this.stateEditInput.style.background = '#1f1f1f';
        this.stateEditInput.style.color = '#F5F5F5';
        this.stateEditInput.style.border = '2px solid #57a0ab';
        this.stateEditInput.style.borderRadius = '4px';
        this.stateEditInput.style.padding = '4px 8px';
        this.stateEditInput.style.fontSize = '16px';
        this.stateEditInput.style.fontFamily = '"IBM Plex Sans", Arial, sans-serif';
        this.stateEditInput.style.textAlign = 'center';
        this.stateEditInput.style.minWidth = '60px';
        this.stateEditInput.style.zIndex = '1000';
        this.stateEditInput.style.outline = 'none';
        
        // Position the input over the state
        const canvasRect = this.canvas.getBoundingClientRect();
        const inputX = canvasRect.left + (x * canvasRect.width / this.canvas.width) - 30;
        const inputY = canvasRect.top + (y * canvasRect.height / this.canvas.height) - 12;
        
        this.stateEditInput.style.left = inputX + 'px';
        this.stateEditInput.style.top = inputY + 'px';
        
        // Add to document
        document.body.appendChild(this.stateEditInput);
        
        // Focus and select all text
        this.stateEditInput.focus();
        this.stateEditInput.select();
        
        // Event listeners
        this.stateEditInput.addEventListener('blur', () => {
            this.finishStateEditing();
        });
        
        this.stateEditInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.finishStateEditing();
            } else if (event.key === 'Escape') {
                this.cancelStateEditing();
            }
        });
        
        // Auto-resize input based on content
        this.stateEditInput.addEventListener('input', () => {
            this.autoResizeStateInput();
        });
        
        this.autoResizeStateInput();
    }

    autoResizeStateInput() {
        if (this.stateEditInput) {
            // Create a temporary span to measure text width
            const span = document.createElement('span');
            span.style.font = this.stateEditInput.style.font;
            span.style.fontSize = this.stateEditInput.style.fontSize;
            span.style.fontFamily = this.stateEditInput.style.fontFamily;
            span.style.visibility = 'hidden';
            span.style.position = 'absolute';
            span.textContent = this.stateEditInput.value || 'q0';
            
            document.body.appendChild(span);
            const width = Math.max(60, span.offsetWidth + 20);
            document.body.removeChild(span);
            
            this.stateEditInput.style.width = width + 'px';
            
            // Recenter the input
            const canvasRect = this.canvas.getBoundingClientRect();
            const inputX = canvasRect.left + (this.editingState.x * canvasRect.width / this.canvas.width) - (width / 2);
            this.stateEditInput.style.left = inputX + 'px';
        }
    }

    finishStateEditing() {
        if (this.stateEditInput && this.editingState) {
            const newLabel = this.stateEditInput.value.trim();
            
            if (newLabel !== '' && newLabel !== this.editingState.label) {
                // Save state before making changes
                this.saveState('edit state label');
                
                const oldLabel = this.editingState.label;
                this.editingState.label = newLabel;
                this.updateStatus(`Renamed state from "${oldLabel}" to "${newLabel}"`);
            } else if (newLabel === '') {
                // Fallback to default if empty
                this.editingState.label = `q${this.editingState.id}`;
            }
            
            this.cleanupStateEditor();
            this.draw();
        }
    }

    cancelStateEditing() {
        this.cleanupStateEditor();
    }

    cleanupStateEditor() {
        if (this.stateEditInput) {
            document.body.removeChild(this.stateEditInput);
            this.stateEditInput = null;
        }
        this.editingState = null;
    }

    drawSelectionRectangle() {
        const ctx = this.ctx;
        const minX = Math.min(this.rectangleStartScreen.x, this.rectangleEndScreen.x);
        const maxX = Math.max(this.rectangleStartScreen.x, this.rectangleEndScreen.x);
        const minY = Math.min(this.rectangleStartScreen.y, this.rectangleEndScreen.y);
        const maxY = Math.max(this.rectangleStartScreen.y, this.rectangleEndScreen.y);
        
        // Draw selection rectangle in screen coordinates (no transform applied)
        ctx.strokeStyle = '#57a0ab';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        
        // Fill with semi-transparent color
        ctx.fillStyle = 'rgba(87, 160, 171, 0.1)';
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        
        ctx.setLineDash([]); // Reset line dash
    }

    drawSelectedElements() {
        const ctx = this.ctx;
        
        for (const element of this.selectedElements) {
            if (element.x !== undefined && element.y !== undefined) {
                // It's a state - draw selection highlight
                ctx.strokeStyle = '#57a0ab';
                ctx.lineWidth = 3;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(element.x, element.y, element.radius + 5, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (element.from !== undefined) {
                // It's a transition - highlight the label area
                const labelPos = this.getTransitionLabelPosition(element);
                if (labelPos) {
                    ctx.strokeStyle = '#57a0ab';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([3, 3]);
                    ctx.strokeRect(labelPos.x - 15, labelPos.y - 10, 30, 20);
                    ctx.setLineDash([]);
                }
            }
        }
    }

    drawStatePreview() {
        const ctx = this.ctx;
        const x = this.currentMousePos.x;
        const y = this.currentMousePos.y;
        const radius = 30;

        // Draw a subtle preview circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        
        // Semi-transparent fill
        ctx.fillStyle = 'rgba(87, 160, 171, 0.2)';
        ctx.fill();
        
        // Dashed border
        ctx.strokeStyle = 'rgba(87, 160, 171, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
        
        // Preview label
        ctx.fillStyle = 'rgba(245, 245, 245, 0.8)';
        ctx.font = '14px "IBM Plex Sans", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`q${this.states.length}`, x, y);
        
        // Small "S" indicator
        ctx.fillStyle = 'rgba(87, 160, 171, 0.8)';
        ctx.font = '10px "IBM Plex Sans", Arial, sans-serif';
        ctx.fillText('S', x + radius - 8, y - radius + 8);
    }

    deleteSelectedElements() {
        if (this.selectedElements.size === 0) {
            this.updateStatus('No elements selected to delete');
            return;
        }

        // Save state before making changes
        this.saveState('delete elements');

        const selectedStates = Array.from(this.selectedElements).filter(el => el.x !== undefined);
        const selectedTransitions = Array.from(this.selectedElements).filter(el => el.from !== undefined);
        
        // Delete selected transitions first
        for (const transition of selectedTransitions) {
            const index = this.transitions.indexOf(transition);
            if (index > -1) {
                this.transitions.splice(index, 1);
            }
        }
        
        // Delete selected states and their associated transitions
        for (const state of selectedStates) {
            // Remove all transitions involving this state
            this.transitions = this.transitions.filter(t => t.from !== state && t.to !== state);
            
            // Remove from states array
            const index = this.states.indexOf(state);
            if (index > -1) {
                this.states.splice(index, 1);
            }
            
            // Handle special state properties
            if (state.isStart) {
                this.startState = null;
            }
            if (state.isAccept) {
                this.acceptStates.delete(state);
            }
        }
        
        // Clear selection
        this.selectedElements.clear();
        
        // Update status
        const totalDeleted = selectedStates.length + selectedTransitions.length;
        this.updateStatus(`Deleted ${selectedStates.length} states and ${selectedTransitions.length} transitions`);
        
        // Check if we need to warn about missing start state
        if (this.states.length > 0 && !this.startState) {
            this.updateStatus('Warning: No start state defined. Right-click a state to set as start.');
        }
        
        this.draw();
    }

    selectAll() {
        this.selectedElements.clear();
        
        // Add all states
        for (const state of this.states) {
            this.selectedElements.add(state);
        }
        
        // Add all transitions
        for (const transition of this.transitions) {
            this.selectedElements.add(transition);
        }
        
        this.updateStatus(`Selected all elements: ${this.states.length} states and ${this.transitions.length} transitions`);
        this.draw();
    }

    // Undo functionality methods
    saveState(action = 'action') {
        if (this.isUndoing) return; // Don't save state during undo operations
        
        const currentState = {
            states: this.states.map(s => ({
                id: s.id,
                label: s.label,
                x: s.x,
                y: s.y,
                radius: s.radius,
                isStart: s.isStart,
                isAccept: s.isAccept
            })),
            transitions: this.transitions.map(t => ({
                fromId: t.from.id,
                toId: t.to.id,
                symbols: [...t.symbols],
                curved: t.curved
            })),
            startStateId: this.startState ? this.startState.id : null,
            acceptStateIds: Array.from(this.acceptStates).map(s => s.id),
            action: action,
            timestamp: Date.now()
        };
        
        // Remove any history after current index (for when we undo then do new action)
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Add new state
        this.history.push(currentState);
        this.historyIndex++;
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    undo() {
        if (this.historyIndex <= 0) {
            this.updateStatus('Nothing to undo');
            return false;
        }
        
        this.isUndoing = true;
        this.historyIndex--;
        const previousState = this.history[this.historyIndex];
        
        this.restoreState(previousState);
        this.updateStatus(`Undid: ${previousState.action}`);
        
        this.isUndoing = false;
        return true;
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) {
            this.updateStatus('Nothing to redo');
            return false;
        }
        
        this.isUndoing = true;
        this.historyIndex++;
        const nextState = this.history[this.historyIndex];
        
        this.restoreState(nextState);
        this.updateStatus(`Redid: ${nextState.action}`);
        
        this.isUndoing = false;
        return true;
    }

    restoreState(savedState) {
        // Clear current state
        this.states = [];
        this.transitions = [];
        this.startState = null;
        this.acceptStates.clear();
        this.selectedElements.clear();
        
        // Restore states
        this.states = savedState.states.map(s => ({
            id: s.id,
            label: s.label,
            x: s.x,
            y: s.y,
            radius: s.radius,
            isStart: s.isStart,
            isAccept: s.isAccept
        }));
        
        // Set start state and accept states
        if (savedState.startStateId !== null) {
            this.startState = this.states.find(s => s.id === savedState.startStateId);
        }
        
        for (const acceptId of savedState.acceptStateIds) {
            const acceptState = this.states.find(s => s.id === acceptId);
            if (acceptState) {
                this.acceptStates.add(acceptState);
            }
        }
        
        // Restore transitions
        this.transitions = savedState.transitions.map(t => ({
            from: this.states.find(s => s.id === t.fromId),
            to: this.states.find(s => s.id === t.toId),
            symbols: [...t.symbols],
            curved: t.curved
        }));
        
        this.draw();
    }

    canUndo() {
        return this.historyIndex > 0;
    }

    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    // Coordinate transformation methods
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.panOffset.x) / this.zoom,
            y: (screenY - this.panOffset.y) / this.zoom
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.zoom + this.panOffset.x,
            y: worldY * this.zoom + this.panOffset.y
        };
    }

    getMousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const screenY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
        return this.screenToWorld(screenX, screenY);
    }

    handleWheel(event) {
        event.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const mouseY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
        
        // Get world coordinates before zoom
        const worldPos = this.screenToWorld(mouseX, mouseY);
        
        // Calculate zoom factor
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));
        
        if (newZoom !== this.zoom) {
            this.zoom = newZoom;
            
            // Adjust pan to keep mouse position fixed
            const newScreenPos = this.worldToScreen(worldPos.x, worldPos.y);
            this.panOffset.x += mouseX - newScreenPos.x;
            this.panOffset.y += mouseY - newScreenPos.y;
            
            this.draw();
            this.updateStatus(`Zoom: ${Math.round(this.zoom * 100)}%`);
        }
    }

    // Zoom control methods
    zoomIn() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const worldCenter = this.screenToWorld(centerX, centerY);
        
        const newZoom = Math.min(this.maxZoom, this.zoom * 1.2);
        if (newZoom !== this.zoom) {
            this.zoom = newZoom;
            
            // Keep center point fixed
            const newScreenCenter = this.worldToScreen(worldCenter.x, worldCenter.y);
            this.panOffset.x += centerX - newScreenCenter.x;
            this.panOffset.y += centerY - newScreenCenter.y;
            
            this.draw();
            this.updateStatus(`Zoom: ${Math.round(this.zoom * 100)}%`);
        }
    }

    zoomOut() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const worldCenter = this.screenToWorld(centerX, centerY);
        
        const newZoom = Math.max(this.minZoom, this.zoom / 1.2);
        if (newZoom !== this.zoom) {
            this.zoom = newZoom;
            
            // Keep center point fixed
            const newScreenCenter = this.worldToScreen(worldCenter.x, worldCenter.y);
            this.panOffset.x += centerX - newScreenCenter.x;
            this.panOffset.y += centerY - newScreenCenter.y;
            
            this.draw();
            this.updateStatus(`Zoom: ${Math.round(this.zoom * 100)}%`);
        }
    }

    resetZoom() {
        this.zoom = 1.0;
        this.panOffset.x = 0;
        this.panOffset.y = 0;
        this.draw();
        this.updateStatus('Zoom reset to 100%');
    }

    fitToView() {
        if (this.states.length === 0) {
            this.resetZoom();
            return;
        }
        
        // Calculate bounding box of all states
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        for (const state of this.states) {
            minX = Math.min(minX, state.x - state.radius);
            minY = Math.min(minY, state.y - state.radius);
            maxX = Math.max(maxX, state.x + state.radius);
            maxY = Math.max(maxY, state.y + state.radius);
        }
        
        // Add some padding
        const padding = 50;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;
        
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        
        // Calculate zoom to fit content
        const zoomX = this.canvas.width / contentWidth;
        const zoomY = this.canvas.height / contentHeight;
        this.zoom = Math.min(zoomX, zoomY, this.maxZoom);
        
        // Center the content
        const contentCenterX = (minX + maxX) / 2;
        const contentCenterY = (minY + maxY) / 2;
        
        this.panOffset.x = this.canvas.width / 2 - contentCenterX * this.zoom;
        this.panOffset.y = this.canvas.height / 2 - contentCenterY * this.zoom;
        
        this.draw();
        this.updateStatus(`Fit to view: ${Math.round(this.zoom * 100)}%`);
    }

    zoomToSelection() {
        const selectedStates = Array.from(this.selectedElements).filter(el => el.x !== undefined);
        
        if (selectedStates.length === 0) {
            this.updateStatus('No states selected to zoom to');
            return;
        }
        
        // Calculate bounding box of selected states
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        for (const state of selectedStates) {
            minX = Math.min(minX, state.x - state.radius);
            minY = Math.min(minY, state.y - state.radius);
            maxX = Math.max(maxX, state.x + state.radius);
            maxY = Math.max(maxY, state.y + state.radius);
        }
        
        // Add some padding
        const padding = 80;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;
        
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        
        // Calculate zoom to fit selected content
        const zoomX = this.canvas.width / contentWidth;
        const zoomY = this.canvas.height / contentHeight;
        this.zoom = Math.min(zoomX, zoomY, this.maxZoom);
        
        // Center the selected content
        const contentCenterX = (minX + maxX) / 2;
        const contentCenterY = (minY + maxY) / 2;
        
        this.panOffset.x = this.canvas.width / 2 - contentCenterX * this.zoom;
        this.panOffset.y = this.canvas.height / 2 - contentCenterY * this.zoom;
        
        this.draw();
        this.updateStatus(`Zoomed to ${selectedStates.length} selected states: ${Math.round(this.zoom * 100)}%`);
    }

    showSelectionMenu(x, y) {
        const menu = document.createElement('div');
        menu.style.position = 'absolute';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.background = '#2a2a2a';
        menu.style.color = '#F5F5F5';
        menu.style.border = '1px solid #57a0ab';
        menu.style.borderRadius = '5px';
        menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        menu.style.padding = '8px 0';
        menu.style.zIndex = '1000';
        menu.style.fontFamily = '"IBM Plex Sans", Arial, sans-serif';
        menu.style.fontSize = '14px';
        menu.style.minWidth = '160px';

        const selectedStates = Array.from(this.selectedElements).filter(el => el.x !== undefined);
        const selectedTransitions = Array.from(this.selectedElements).filter(el => el.from !== undefined);
        
        // Zoom to selection option
        if (selectedStates.length > 0) {
            const zoomToSelection = document.createElement('div');
            zoomToSelection.textContent = `🔍 Zoom to Selection (${selectedStates.length} states)`;
            zoomToSelection.style.padding = '8px 16px';
            zoomToSelection.style.cursor = 'pointer';
            zoomToSelection.style.borderBottom = '1px solid #444';
            zoomToSelection.onmouseover = () => zoomToSelection.style.background = '#57a0ab';
            zoomToSelection.onmouseout = () => zoomToSelection.style.background = 'transparent';
            zoomToSelection.onclick = () => {
                this.zoomToSelection();
                document.body.removeChild(menu);
            };
            menu.appendChild(zoomToSelection);
        }

        // Delete selection option
        const deleteSelection = document.createElement('div');
        deleteSelection.textContent = `🗑️ Delete Selection (${selectedStates.length} states, ${selectedTransitions.length} transitions)`;
        deleteSelection.style.padding = '8px 16px';
        deleteSelection.style.cursor = 'pointer';
        deleteSelection.style.borderBottom = selectedStates.length > 0 ? '1px solid #444' : 'none';
        deleteSelection.onmouseover = () => deleteSelection.style.background = '#d32f2f';
        deleteSelection.onmouseout = () => deleteSelection.style.background = 'transparent';
        deleteSelection.onclick = () => {
            this.deleteSelectedElements();
            document.body.removeChild(menu);
        };
        menu.appendChild(deleteSelection);

        // Bulk operations for states
        if (selectedStates.length > 1) {
            const setAllAccepting = document.createElement('div');
            setAllAccepting.textContent = '✅ Set All as Accepting';
            setAllAccepting.style.padding = '8px 16px';
            setAllAccepting.style.cursor = 'pointer';
            setAllAccepting.style.borderBottom = '1px solid #444';
            setAllAccepting.onmouseover = () => setAllAccepting.style.background = '#57a0ab';
            setAllAccepting.onmouseout = () => setAllAccepting.style.background = 'transparent';
            setAllAccepting.onclick = () => {
                this.saveState('set all accepting');
                selectedStates.forEach(state => {
                    state.isAccept = true;
                    this.acceptStates.add(state);
                });
                this.draw();
                this.updateStatus(`Set ${selectedStates.length} states as accepting`);
                document.body.removeChild(menu);
            };
            menu.appendChild(setAllAccepting);

            const removeAllAccepting = document.createElement('div');
            removeAllAccepting.textContent = '➖ Remove All from Accepting';
            removeAllAccepting.style.padding = '8px 16px';
            removeAllAccepting.style.cursor = 'pointer';
            removeAllAccepting.onmouseover = () => removeAllAccepting.style.background = '#57a0ab';
            removeAllAccepting.onmouseout = () => removeAllAccepting.style.background = 'transparent';
            removeAllAccepting.onclick = () => {
                this.saveState('remove all accepting');
                selectedStates.forEach(state => {
                    state.isAccept = false;
                    this.acceptStates.delete(state);
                });
                this.draw();
                this.updateStatus(`Removed ${selectedStates.length} states from accepting`);
                document.body.removeChild(menu);
            };
            menu.appendChild(removeAllAccepting);
        }

        document.body.appendChild(menu);

        // Remove menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', function removeMenu() {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                document.removeEventListener('click', removeMenu);
            });
        }, 100);
    }
} 