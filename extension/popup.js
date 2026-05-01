// Link to the HTML checkbox
const toggle = document.getElementById("toggleShield");

// 1. When the popup opens, ask Chrome if the user previously turned it on or off
chrome.storage.sync.get(["shieldEnabled"], (result) => {
    // Default to true if they never set it
    toggle.checked = result.shieldEnabled !== false; 
});

// 2. When the user clicks the switch, save the new state to Chrome
toggle.addEventListener("change", () => {
    chrome.storage.sync.set({ shieldEnabled: toggle.checked });
});
const slider = document.getElementById("sensitivitySlider");
const sliderValueText = document.getElementById("sliderValue");

// Load the saved slider value (default to 75 if they haven't set it)
chrome.storage.sync.get(["toxicThreshold"], (result) => {
    const savedValue = result.toxicThreshold || 75;
    slider.value = savedValue;
    sliderValueText.innerText = savedValue + "%";
});

// Update text and save to Chrome when the user moves the slider
slider.addEventListener("input", () => {
    sliderValueText.innerText = slider.value + "%";
});

slider.addEventListener("change", () => {
    chrome.storage.sync.set({ toxicThreshold: parseInt(slider.value) });
});
// Fetch stats from the database
const statsCounter = document.getElementById("statsCounter");

async function loadStats() {
    try {
        const response = await fetch("http://127.0.0.1:8000/stats");
        const data = await response.json();
        
        // Animate the counter for premium aesthetics!
        let current = 0;
        const target = data.total_blocked;
        const timer = setInterval(() => {
            if (current >= target) {
                statsCounter.innerText = target;
                clearInterval(timer);
                return;
            }
            statsCounter.innerText = current;
            current += Math.max(1, Math.floor(target / 10)); // Speed of animation
        }, 50);
        
    } catch (e) {
        statsCounter.innerText = "Error";
    }
}

// Load stats when popup opens
loadStats();
