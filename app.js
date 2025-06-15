// Main application initialization
let visualizer;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the state visualizer
    visualizer = new StateVisualizer('diagram-canvas');
    
    // Set up canvas resizing
    setupCanvasResizing();
    
    // Set up event listeners for UI controls
    setupUIEventListeners();
    
    // Set up modal system
    setupModals();
    
    // Set up toolbar collapse
    setupToolbarCollapse();
    
    // Load a default example
    visualizer.loadExample('dfa');
    
    console.log('TCS State Diagram Visualizer initialized successfully!');
    
    // Debug: Check if template selector exists
    const templateSelect = document.getElementById('template-select');
    console.log('Template selector element:', templateSelect);
    if (templateSelect) {
        console.log('Template selector options:', templateSelect.options.length);
        for (let i = 0; i < templateSelect.options.length; i++) {
            console.log(`Option ${i}:`, templateSelect.options[i].value, templateSelect.options[i].text);
        }
    }
    
    // Make visualizer globally accessible for debugging
    window.visualizer = visualizer;
    console.log('Visualizer is now globally accessible as window.visualizer');
    
    // Debug function to check available methods
    window.debugVisualizer = function() {
        console.log('Visualizer methods:');
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(visualizer));
        methods.forEach(method => {
            if (typeof visualizer[method] === 'function') {
                console.log('- ' + method);
            }
        });
        return methods.filter(method => typeof visualizer[method] === 'function');
    };
    
    console.log('Available methods:', window.debugVisualizer());
    
    // Manual template loading function for testing
    window.manualLoadTemplate = function(templateName) {
        console.log('Manual template loading:', templateName);
        
        const templates = {
            endsWithAB: {
                metadata: { title: "DFA: Strings ending with 'ab'" },
                states: [
                    { id: 0, label: 'q0', x: 200, y: 300, isStart: true },
                    { id: 1, label: 'q1', x: 450, y: 300 },
                    { id: 2, label: 'q2', x: 700, y: 300, isAccept: true }
                ],
                transitions: [
                    { from: 0, to: 0, symbols: ['b'] },
                    { from: 0, to: 1, symbols: ['a'] },
                    { from: 1, to: 0, symbols: ['a'] },
                    { from: 1, to: 2, symbols: ['b'] },
                    { from: 2, to: 1, symbols: ['a'] },
                    { from: 2, to: 0, symbols: ['b'] }
                ]
            }
        };
        
        if (templates[templateName] && visualizer.createFromStructure) {
            return visualizer.createFromStructure(templates[templateName]);
        } else {
            console.log('Template not found or createFromStructure not available');
            return false;
        }
    };
});

function setupCanvasResizing() {
    const canvas = document.getElementById('diagram-canvas');
    const container = document.querySelector('.canvas-container');
    
    function resizeCanvas() {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        // Redraw after resize
        if (visualizer) {
            visualizer.draw();
        }
    }
    
    // Initial resize
    resizeCanvas();
    
    // Resize on window resize
    window.addEventListener('resize', resizeCanvas);
    
    // Resize when toolbar is collapsed/expanded
    const toolbar = document.getElementById('toolbar');
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                setTimeout(resizeCanvas, 300); // Wait for transition
            }
        });
    });
    observer.observe(toolbar, { attributes: true });
    
    // Resize when sidebar opens/closes
    const canvasContainer = document.querySelector('.canvas-container');
    const containerObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                setTimeout(resizeCanvas, 300); // Wait for transition
            }
        });
    });
    containerObserver.observe(canvasContainer, { attributes: true });
}

function setupToolbarCollapse() {
    const collapseBtn = document.getElementById('collapse-btn');
    const toolbar = document.getElementById('toolbar');
    
    collapseBtn.addEventListener('click', function() {
        toolbar.classList.toggle('collapsed');
        
        if (toolbar.classList.contains('collapsed')) {
            collapseBtn.textContent = '▼';
            collapseBtn.style.position = 'fixed';
            collapseBtn.style.top = '8px';
            collapseBtn.style.left = '16px';
            collapseBtn.style.zIndex = '1001';
        } else {
            collapseBtn.textContent = '▲';
            collapseBtn.style.position = 'static';
            collapseBtn.style.zIndex = 'auto';
        }
    });
}

function setupModals() {
    // Sidebar buttons
    const statusBtn = document.getElementById('status-modal-btn');
    const helpBtn = document.getElementById('help-modal-btn');
    const codeBtn = document.getElementById('code-modal-btn');
    
    // Sidebar elements
    const sidebar = document.getElementById('sidebar');
    const sidebarTitle = document.getElementById('sidebar-title');
    const sidebarContent = document.getElementById('sidebar-content');
    const sidebarClose = document.getElementById('sidebar-close');
    const canvasContainer = document.querySelector('.canvas-container');
    
    // Content templates
    const statusContent = document.getElementById('status-content');
    const helpContent = document.getElementById('help-content');
    const codeContent = document.getElementById('code-content');
    
    // Open sidebar functions
    statusBtn.addEventListener('click', () => openSidebar('Status', statusContent));
    helpBtn.addEventListener('click', () => openSidebar('Instructions', helpContent));
    codeBtn.addEventListener('click', () => openSidebar('Programmatic Interface', codeContent));
    
    // Close sidebar
    sidebarClose.addEventListener('click', closeSidebar);
    
    // Close sidebar with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            closeSidebar();
        }
    });
    
    function openSidebar(title, contentTemplate) {
        sidebarTitle.textContent = title;
        sidebarContent.innerHTML = contentTemplate.innerHTML;
        sidebar.classList.add('active');
        canvasContainer.classList.add('sidebar-open');
        
        // Re-attach event listeners for dynamically loaded content
        if (title === 'Programmatic Interface') {
            setupCodePanelListeners();
        } else if (title === 'Batch Testing') {
            setupBatchTestListeners();
        }
        
        // Resize canvas after sidebar opens
        setTimeout(() => {
            if (visualizer) {
                const canvas = document.getElementById('diagram-canvas');
                const rect = canvasContainer.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
                visualizer.draw();
            }
        }, 300);
    }
    
    function setupCodePanelListeners() {
        // Create from structure button
        const createFromStructureBtn = sidebarContent.querySelector('#create-from-structure-btn');
        if (createFromStructureBtn) {
            createFromStructureBtn.addEventListener('click', function() {
                const structureInput = sidebarContent.querySelector('#structure-input');
                const structureText = structureInput.value.trim();
                
                if (!structureText) {
                    alert('Please enter a structure definition!');
                    return;
                }
                
                try {
                    const structure = JSON.parse(structureText);
                    const success = visualizer.createFromStructure(structure);
                    
                    if (success) {
                        // Update batch test info if sidebar is open
                        updateCurrentDFAInfo();
                        
                        // Clear the input after successful creation
                        structureInput.value = '';
                    }
                } catch (error) {
                    alert('Invalid JSON structure: ' + error.message);
                    visualizer.updateStatus('Error parsing structure: ' + error.message);
                }
            });
        }

        // Copy current diagram button
        const copyCurrentBtn = sidebarContent.querySelector('#copy-current-btn');
        if (copyCurrentBtn) {
            copyCurrentBtn.addEventListener('click', function() {
                if (visualizer.states.length === 0) {
                    alert('Please create a diagram first!');
                    return;
                }
                
                // Generate the current structure
                const currentStructure = {
                    metadata: { title: "Current Diagram" },
                    states: visualizer.states.map(s => ({
                        id: s.id,
                        label: s.label,
                        x: s.x,
                        y: s.y,
                        isStart: s.isStart,
                        isAccept: s.isAccept
                    })),
                    transitions: visualizer.transitions.map(t => ({
                        from: t.from.id,
                        to: t.to.id,
                        symbols: t.symbols,
                        curved: t.curved
                    }))
                };
                
                // Populate the textarea
                const structureInput = sidebarContent.querySelector('#structure-input');
                structureInput.value = JSON.stringify(currentStructure, null, 2);
                
                visualizer.updateStatus('Current diagram structure copied to editor');
            });
        }
    }
    
    function closeSidebar() {
        sidebar.classList.remove('active');
        canvasContainer.classList.remove('sidebar-open');
        
        // Resize canvas after sidebar closes
        setTimeout(() => {
            if (visualizer) {
                const canvas = document.getElementById('diagram-canvas');
                const rect = canvasContainer.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
                visualizer.draw();
            }
        }, 300);
    }
}

function setupBatchTestListeners() {
    const sidebarContent = document.getElementById('sidebar-content');
    
    // Update current DFA information
    updateCurrentDFAInfo();
    
    // Run batch test button
    const runBatchTestBtn = sidebarContent.querySelector('#run-batch-test-btn');
    if (runBatchTestBtn) {
        runBatchTestBtn.addEventListener('click', async function() {
            const batchInput = sidebarContent.querySelector('#batch-input');
            const batchResults = sidebarContent.querySelector('#batch-results');
            const inputText = batchInput.value.trim();
            
            if (!inputText) {
                alert('Please enter test strings, one per line!');
                return;
            }
            
            // Parse input strings
            const inputStrings = inputText.split('\n')
                .map(s => s.trim())
                .filter(s => s.length > 0);
            
            if (inputStrings.length === 0) {
                alert('No valid test strings found!');
                return;
            }
            
            // Disable button during testing
            this.disabled = true;
            this.innerHTML = '<span class="loading"></span> Testing...';
            
            try {
                // Show progress
                showBatchProgress(batchResults, inputStrings.length);
                
                const automatonType = document.getElementById('automaton-type').value;
                const results = await visualizer.batchTestStrings(inputStrings, automatonType);
                
                // Display results
                displayBatchResults(batchResults, results);
                
                // Update status
                const passed = results.filter(r => r.accepted).length;
                const failed = results.length - passed;
                visualizer.updateStatus(`Batch test completed: ${passed} passed, ${failed} failed`);
                
            } catch (error) {
                alert('Batch test error: ' + error.message);
                batchResults.innerHTML = '';
            } finally {
                // Re-enable button
                this.disabled = false;
                this.innerHTML = '🚀 Run Batch Test';
            }
        });
    }

    // Clear batch button
    const clearBatchBtn = sidebarContent.querySelector('#clear-batch-btn');
    if (clearBatchBtn) {
        clearBatchBtn.addEventListener('click', function() {
            const batchInput = sidebarContent.querySelector('#batch-input');
            const batchResults = sidebarContent.querySelector('#batch-results');
            batchInput.value = '';
            batchResults.innerHTML = '';
        });
    }
}

function updateCurrentDFAInfo() {
    const alphabetDisplay = document.getElementById('alphabet-display');
    const descriptionDisplay = document.getElementById('description-display');
    
    // Only update if the batch test panel is currently loaded
    if (!alphabetDisplay || !descriptionDisplay || !visualizer) {
        return;
    }
    
    // Get current alphabet
    const alphabet = visualizer.getAlphabet();
    alphabetDisplay.textContent = alphabet.length > 0 ? `{${alphabet.join(', ')}}` : 'No transitions defined';
    
    // Get description based on current states and transitions
    const stateCount = visualizer.states.length;
    const transitionCount = visualizer.transitions.length;
    const acceptStateCount = visualizer.acceptStates.size;
    
    // Detect if this is an NFA
    const isNFA = detectNFA();
    const automatonType = isNFA ? 'NFA' : 'DFA';
    
    descriptionDisplay.textContent = `${automatonType}: ${stateCount} states, ${transitionCount} transitions, ${acceptStateCount} accepting (alphabet: ${alphabet.join(',')})`;
}

function detectNFA() {
    if (!visualizer || !visualizer.states || !visualizer.transitions) {
        return false;
    }
    
    // Check for epsilon transitions
    const hasEpsilonTransitions = visualizer.transitions.some(t => 
        t.symbols.includes('ε') || t.symbols.includes('')
    );
    
    if (hasEpsilonTransitions) {
        return true;
    }
    
    // Check for nondeterminism (multiple transitions from same state on same symbol)
    const stateSymbolPairs = new Set();
    for (const transition of visualizer.transitions) {
        for (const symbol of transition.symbols) {
            const key = `${transition.from.id}-${symbol}`;
            if (stateSymbolPairs.has(key)) {
                return true; // Found nondeterminism
            }
            stateSymbolPairs.add(key);
        }
    }
    
    return false;
}

// Global function for progress updates
window.updateBatchProgress = function(current, total, currentString) {
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    
    if (progressFill && progressText) {
        const percentage = (current / total) * 100;
        progressFill.style.width = percentage + '%';
        progressText.textContent = `Testing ${current}/${total}: "${currentString}"`;
    }
};

function showBatchProgress(container, totalTests) {
    container.innerHTML = `
        <div class="batch-progress">
            <div class="progress-text">Preparing to test ${totalTests} strings...</div>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
        </div>
    `;
}

function displayBatchResults(container, results) {
    const passed = results.filter(r => r.accepted && !r.error).length;
    const failed = results.filter(r => !r.accepted || r.error).length;
    const total = results.length;
    
    let html = `
        <div class="batch-summary">
            <h4>Batch Test Results</h4>
            <div class="batch-stats">
                <div class="batch-stat total">
                    <span class="number">${total}</span>
                    <span class="label">Total</span>
                </div>
                <div class="batch-stat passed">
                    <span class="number">${passed}</span>
                    <span class="label">Passed</span>
                </div>
                <div class="batch-stat failed">
                    <span class="number">${failed}</span>
                    <span class="label">Failed</span>
                </div>
            </div>
        </div>
        <div class="batch-details">
            <h5>Detailed Results</h5>
    `;
    
    results.forEach(result => {
        const resultClass = result.accepted && !result.error ? 'accepted' : 'rejected';
        const resultText = result.error ? 'ERROR' : (result.accepted ? 'ACCEPTED' : 'REJECTED');
        const displayString = result.string === '' ? '(empty string)' : result.string;
        
        html += `
            <div class="test-result ${resultClass}">
                <span class="string">"${displayString}"</span>
                <span class="result">${resultText}</span>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function setupUIEventListeners() {
    // Automaton type selector
    const automatonTypeSelect = document.getElementById('automaton-type');
    automatonTypeSelect.addEventListener('change', function() {
        const type = this.value;
        visualizer.updateStatus(`Switched to ${type.toUpperCase()} mode`);
    });

    // Animation button
    const animateBtn = document.getElementById('animate-btn');
    animateBtn.addEventListener('click', async function() {
        const inputString = document.getElementById('input-string').value;
        const automatonType = document.getElementById('automaton-type').value;
        
        if (!inputString.trim()) {
            alert('Please enter a string to test!');
            return;
        }
        
        if (visualizer.states.length === 0) {
            alert('Please create a diagram first!');
            return;
        }
        
        // Disable button during animation
        this.disabled = true;
        this.innerHTML = '<span class="loading"></span> Animating...';
        
        try {
            await visualizer.animateString(inputString.trim(), automatonType);
        } catch (error) {
            console.error('Animation error:', error);
            visualizer.updateStatus('Animation error: ' + error.message);
        } finally {
            // Re-enable button
            this.disabled = false;
            this.innerHTML = '🎬 Animate';
        }
    });

    // Batch test button
    const batchTestBtn = document.getElementById('batch-test-btn');
    batchTestBtn.addEventListener('click', function() {
        if (visualizer.states.length === 0) {
            alert('Please create a diagram first!');
            return;
        }
        
        // Open batch test sidebar using the same mechanism as other modals
        const sidebar = document.getElementById('sidebar');
        const sidebarTitle = document.getElementById('sidebar-title');
        const sidebarContent = document.getElementById('sidebar-content');
        const canvasContainer = document.querySelector('.canvas-container');
        const batchTestContent = document.getElementById('batch-test-content');
        
        sidebarTitle.textContent = 'Batch Testing';
        sidebarContent.innerHTML = batchTestContent.innerHTML;
        sidebar.classList.add('active');
        canvasContainer.classList.add('sidebar-open');
        
        // Set up batch test listeners
        setupBatchTestListeners();
        
        // Resize canvas after sidebar opens
        setTimeout(() => {
            if (visualizer) {
                const canvas = document.getElementById('diagram-canvas');
                const rect = canvasContainer.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
                visualizer.draw();
            }
        }, 300);
    });

    // Add state button
    const addStateBtn = document.getElementById('add-state-btn');
    addStateBtn.addEventListener('click', function() {
        if (visualizer.mode === 'addState') {
            visualizer.setMode('view');
            this.textContent = '➕ Add State';
            this.style.background = '#57a0ab';
        } else {
            visualizer.setMode('addState');
            this.textContent = '✅ Click Canvas';
            this.style.background = '#6bb3bf';
        }
    });

    // Add transition button
    const addTransitionBtn = document.getElementById('add-transition-btn');
    addTransitionBtn.addEventListener('click', function() {
        if (visualizer.mode === 'addTransition') {
            visualizer.setMode('view');
            this.textContent = '↗️ Add Transition';
            this.style.background = '#57a0ab';
        } else {
            visualizer.setMode('addTransition');
            this.textContent = '🔗 Select States';
            this.style.background = '#6bb3bf';
        }
    });

    // Clear button
    const clearBtn = document.getElementById('clear-btn');
    clearBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear the entire diagram?')) {
            visualizer.clear();
            resetButtons();
        }
    });

    // Template selector
    const templateSelect = document.getElementById('template-select');
    if (templateSelect) {
        console.log('Template selector found, adding event listener');
        
        // Add multiple event listeners to catch any issues
        templateSelect.addEventListener('change', function(event) {
            console.log('Change event fired!');
            const templateName = this.value;
            console.log('Template selected:', templateName);
            if (templateName && templateName !== '') {
                const success = visualizer.loadTemplate(templateName);
                console.log('Template load result:', success);
                if (success) {
                    resetButtons();
                    
                    // Update batch test info if sidebar is open
                    updateCurrentDFAInfo();
                    
                    // Set appropriate test strings based on template
                    const inputStringField = document.getElementById('input-string');
                    const automatonTypeSelect = document.getElementById('automaton-type');
                    
                    switch (templateName) {
                        case 'endsWithAB':
                            inputStringField.value = 'aab';
                            inputStringField.placeholder = 'Try: "ab", "aab", "bab"';
                            automatonTypeSelect.value = 'dfa';
                            break;
                        case 'endsWithBinary01':
                            inputStringField.value = '101';
                            inputStringField.placeholder = 'Try: "01", "101", "001", "1001"';
                            automatonTypeSelect.value = 'dfa';
                            break;
                        case 'evenZerosOnes':
                            inputStringField.value = '0011';
                            inputStringField.placeholder = 'Try: "00", "11", "0011", "01"';
                            automatonTypeSelect.value = 'dfa';
                            break;
                        case 'contains101':
                            inputStringField.value = '101';
                            inputStringField.placeholder = 'Try: "101", "0101", "1010", "1101"';
                            automatonTypeSelect.value = 'nfa';
                            break;
                        case 'binaryMod3':
                            inputStringField.value = '11';
                            inputStringField.placeholder = 'Try: "0", "11", "110", "1001"';
                            automatonTypeSelect.value = 'dfa';
                            break;
                        case 'epsilonNFA':
                            inputStringField.value = 'a';
                            inputStringField.placeholder = 'Try: "a", "b", "ab"';
                            automatonTypeSelect.value = 'nfa';
                            break;
                    }
                    
                    // Reset selector
                    this.value = '';
                }
            }
        });
        
        // Also add click event as backup
        templateSelect.addEventListener('click', function() {
            console.log('Template selector clicked');
        });
        
        // Test function - can be called from console
        window.testTemplate = function(templateName) {
            console.log('Manual template test:', templateName);
            return visualizer.loadTemplate(templateName || 'endsWithAB');
        };
        
    } else {
        console.log('Template selector not found!');
    }

    // Export button
    const exportBtn = document.getElementById('export-btn');
    exportBtn.addEventListener('click', function() {
        const format = document.getElementById('export-format').value;
        
        if (visualizer.states.length === 0) {
            alert('Please create a diagram first!');
            return;
        }
        
        switch (format) {
            case 'png':
                visualizer.exportAsPNG();
                break;
            case 'svg':
                visualizer.exportAsSVG();
                break;
            case 'json':
                visualizer.exportAsJSON();
                break;
            default:
                alert('Unknown export format!');
        }
        
        visualizer.updateStatus(`Exported diagram as ${format.toUpperCase()}`);
    });

    // Dedicated JSON export button
    const exportJsonBtn = document.getElementById('export-json-btn');
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', function() {
            if (visualizer.states.length === 0) {
                alert('Please create a diagram first!');
                return;
            }
            
            visualizer.exportAsJSON();
            visualizer.updateStatus('Exported current diagram as JSON');
        });
    }

    // Input string field - allow Enter key to trigger animation
    const inputStringField = document.getElementById('input-string');
    inputStringField.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            document.getElementById('animate-btn').click();
        }
    });

    // File input for importing JSON (create dynamically)
    createImportFunctionality();

    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        // Don't trigger shortcuts if user is typing in an input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // S key: Add State at mouse position
        if (event.key === 's' || event.key === 'S') {
            event.preventDefault();
            visualizer.addStateAtMouse();
        }
        
        // Plus/Equals key: Zoom In
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            visualizer.zoomIn();
        }
        
        // Minus key: Zoom Out
        if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            visualizer.zoomOut();
        }
        
        // 0 key: Reset Zoom
        if (event.key === '0') {
            event.preventDefault();
            visualizer.resetZoom();
        }
        
        // F key: Fit to View
        if (event.key === 'f' || event.key === 'F') {
            event.preventDefault();
            visualizer.fitToView();
        }
        
        // Ctrl/Cmd + S: Add State (original functionality)
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            document.getElementById('add-state-btn').click();
        }
        
        // Ctrl/Cmd + T: Add Transition
        if ((event.ctrlKey || event.metaKey) && event.key === 't') {
            event.preventDefault();
            document.getElementById('add-transition-btn').click();
        }
        
        // Ctrl/Cmd + Enter: Animate
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            document.getElementById('animate-btn').click();
        }
        
        // Delete key: Delete selected elements
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            visualizer.deleteSelectedElements();
        }
        
        // Ctrl/Cmd + A: Select all
        if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
            event.preventDefault();
            visualizer.selectAll();
        }
        
        // Ctrl/Cmd + Z: Undo
        if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            visualizer.undo();
        }
        
        // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
        if (((event.ctrlKey || event.metaKey) && event.key === 'y') || 
            ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z')) {
            event.preventDefault();
            visualizer.redo();
        }
        
        // Escape: Cancel current mode or clear selection
        if (event.key === 'Escape') {
            if (visualizer.selectedElements.size > 0) {
                visualizer.selectedElements.clear();
                visualizer.draw();
                visualizer.updateStatus('Selection cleared');
            } else {
                visualizer.setMode('view');
                resetButtons();
            }
        }
    });

    // Window resize handler
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            // Redraw canvas on resize
            visualizer.draw();
        }, 250);
    });
}

function resetButtons() {
    const addStateBtn = document.getElementById('add-state-btn');
    const addTransitionBtn = document.getElementById('add-transition-btn');
    
    addStateBtn.textContent = '➕ Add State';
    addStateBtn.style.background = '#57a0ab';
    
    addTransitionBtn.textContent = '↗️ Add Transition';
    addTransitionBtn.style.background = '#57a0ab';
}

function createImportFunctionality() {
    // Create hidden file input for importing
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    visualizer.importFromJSON(e.target.result);
                    resetButtons();
                } catch (error) {
                    alert('Error importing file: ' + error.message);
                }
            };
            reader.readAsText(file);
        }
    });

    // Note: Import functionality is available via the hidden file input
    // Can be triggered programmatically if needed
    window.triggerImport = function() {
        fileInput.click();
    };
}

// Utility functions for advanced features
function generateRandomDFA() {
    if (confirm('This will replace the current diagram. Continue?')) {
        visualizer.clear();
        
        // Generate a random DFA with 3-5 states
        const numStates = Math.floor(Math.random() * 3) + 3;
        const alphabet = ['a', 'b'];
        
        // Create states
        for (let i = 0; i < numStates; i++) {
            const x = 150 + (i * 150) + Math.random() * 100;
            const y = 200 + Math.random() * 200;
            visualizer.addState(x, y);
        }
        
        // Make random states accepting
        const numAcceptStates = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < numAcceptStates; i++) {
            const randomState = visualizer.states[Math.floor(Math.random() * visualizer.states.length)];
            randomState.isAccept = true;
            visualizer.acceptStates.add(randomState);
        }
        
        // Add transitions to make it a complete DFA
        for (const state of visualizer.states) {
            for (const symbol of alphabet) {
                const targetState = visualizer.states[Math.floor(Math.random() * visualizer.states.length)];
                const transition = {
                    from: state,
                    to: targetState,
                    symbols: [symbol],
                    curved: state === targetState || visualizer.calculateCurve(state, targetState)
                };
                visualizer.transitions.push(transition);
            }
        }
        
        visualizer.draw();
        visualizer.updateStatus('Generated random DFA');
        document.getElementById('input-string').value = 'ab';
    }
}

// Add random generation feature (call this function from console or add button)
function addRandomGeneratorButton() {
    // Note: This function would add a random generator button if .controls element existed
    console.log('Random generator functionality available via generateRandomDFA() function');
}

// YouTube-specific features
function setupYouTubeFeatures() {
    // Add high-quality recording mode functionality
    window.enableRecordingMode = function() {
        // Increase canvas resolution for recording
        const canvas = document.getElementById('diagram-canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        
        // Increase font sizes and line widths for better visibility
        visualizer.draw();
        visualizer.updateStatus('Switched to high-quality recording mode (1920x1080)');
        
        console.log('Recording mode enabled - canvas set to 1920x1080');
    };
}

// Initialize YouTube features when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add YouTube-specific features
    setupYouTubeFeatures();
}); 