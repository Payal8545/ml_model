let textQueue = [];       // Holds paragraphs waiting to be checked
let checkedCache = new Set(); // Remembers paragraphs we already checked

// 1. Function to process the queue every 1 second
async function processQueue() {
    if (textQueue.length === 0) return;

    // Grab up to 50 items from the queue
    const batch = textQueue.splice(0, 50);

    // Extract just the strings
    const texts = batch.map(item => item.text);

    try {
        const response = await fetch("http://127.0.0.1:8000/predict_batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: texts })
        });

        const data = await response.json();

        // Ask Chrome what the user set their slider to (default 75 if missing)
        chrome.storage.sync.get(["toxicThreshold"], (storage) => {
            const userThreshold = (storage.toxicThreshold || 75) / 100.0; // Convert 75 to 0.75

            data.results.forEach((result, index) => {
                // IMPORTANT: We compare the raw score from the API to the user's slider setting!
                if (result.score >= userThreshold) {
                    const element = batch[index].element;
                    
                    // Hide the original text
                    element.style.display = "none";
                    
                    // Create a container for our buttons
                    const container = document.createElement("div");
                    container.style.display = "flex";
                    container.style.gap = "10px";
                    container.style.alignItems = "center";
                    container.style.margin = "5px 0";

                    // Create the "Click to Reveal" button
                    const revealBtn = document.createElement("button");
                    revealBtn.innerText = "⚠️ Toxic Comment Hidden - Click to View";
                    revealBtn.style.padding = "8px 12px";
                    revealBtn.style.backgroundColor = "#fee2e2";
                    revealBtn.style.color = "#991b1b";
                    revealBtn.style.border = "1px solid #ef4444";
                    revealBtn.style.borderRadius = "6px";
                    revealBtn.style.cursor = "pointer";
                    revealBtn.style.fontSize = "0.9rem";
                    revealBtn.style.fontFamily = "inherit";
                    revealBtn.style.fontWeight = "bold";

                    // Create the "Report Mistake" button
                    const reportBtn = document.createElement("button");
                    reportBtn.innerText = "🚩 Report Mistake";
                    reportBtn.style.padding = "8px 12px";
                    reportBtn.style.backgroundColor = "#f3f4f6";
                    reportBtn.style.color = "#374151";
                    reportBtn.style.border = "1px solid #d1d5db";
                    reportBtn.style.borderRadius = "6px";
                    reportBtn.style.cursor = "pointer";
                    reportBtn.style.fontSize = "0.9rem";
                    reportBtn.style.fontFamily = "inherit";
                    reportBtn.style.fontWeight = "bold";

                    // When clicked, hide the container and restore the text
                    revealBtn.addEventListener("click", () => {
                        container.style.display = "none";
                        element.style.display = ""; // restores normal display
                    });

                    // When report clicked, send to server
                    reportBtn.addEventListener("click", async () => {
                        reportBtn.innerText = "✅ Reported!";
                        reportBtn.disabled = true;
                        reportBtn.style.backgroundColor = "#d1fae5";
                        reportBtn.style.color = "#065f46";
                        try {
                            await fetch("http://127.0.0.1:8000/report_mistake", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ text: batch[index].text, score: result.score })
                            });
                        } catch (e) {
                            console.error("Failed to report mistake", e);
                            reportBtn.innerText = "❌ Error";
                        }
                    });

                    container.appendChild(revealBtn);
                    container.appendChild(reportBtn);

                    // Insert the container exactly where the text was
                    element.parentNode.insertBefore(container, element);
                }
            });
        });
    } catch (error) {
        console.error("API error", error);
    }
}

// Run the queue processor every 1000 milliseconds (1 second)
// Run the queue processor every 1 second, BUT ONLY if the shield is enabled!
setInterval(() => {
    chrome.storage.sync.get(["shieldEnabled"], (result) => {
        // Only process the queue if the toggle switch is ON (or defaults to ON)
        if (result.shieldEnabled !== false) {
            processQueue();
        }
    });
}, 1000);



// 2. Function to find un-checked comments and add them to the queue
function scanForNewParagraphs() {
    let elementsToCheck = [];

    // Check if we are currently on YouTube
    if (window.location.hostname.includes("youtube.com")) {
        // YouTube uses the ID 'content-text' for its comments
        elementsToCheck = document.querySelectorAll('#content-text');
    } else {
        // For generic websites, default back to standard paragraph tags
        elementsToCheck = document.querySelectorAll('p');
    }
    
    // Loop through whatever we found
    elementsToCheck.forEach(element => {
        const text = element.innerText.trim();
        
        // If it's long enough, and we haven't checked it yet...
        if (text.length > 5 && !checkedCache.has(text)) {
            checkedCache.add(text); // Mark as checked
            textQueue.push({ text: text, element: element }); // Add to queue
        }
    });
}


// 3. The MutationObserver: Watch the website for ANY changes!
// This automatically fires scanForNewParagraphs() whenever the user scrolls and new data loads.
const observer = new MutationObserver(() => {
    scanForNewParagraphs();
});

// Start observing the whole website body for changes
observer.observe(document.body, { childList: true, subtree: true });

// Also run it once immediately when the page first loads
scanForNewParagraphs();
