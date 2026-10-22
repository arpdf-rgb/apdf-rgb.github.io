let currentTool = "";

function openTool(toolName) {
    currentTool = toolName;
    document.getElementById('toolModal').style.display = 'block';
    document.getElementById('fileInput').value = "";
    document.getElementById('statusMsg').innerText = "";
    
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDesc');
    const fileInput = document.getElementById('fileInput');
    const extraInputs = document.getElementById('extraInputs');
    const splitOptions = document.getElementById('splitOptions');
    const textOptions = document.getElementById('textOptions');

    extraInputs.style.display = 'none';
    splitOptions.style.display = 'none';
    textOptions.style.display = 'none';
    fileInput.multiple = false;
    fileInput.accept = ".pdf";

    if (toolName === 'merge') { 
        title.innerText = "Merge PDF"; desc.innerText = "Select multiple PDFs to combine."; fileInput.multiple = true; 
    } else if (toolName === 'split') { 
        title.innerText = "Split PDF"; desc.innerText = "Extract a specific page."; extraInputs.style.display = 'block'; splitOptions.style.display = 'block'; 
    } else if (toolName === 'rotate') { 
        title.innerText = "Rotate PDF"; desc.innerText = "Rotate pages 90 degrees clockwise."; 
    } else if (toolName === 'jpgToPdf') { 
        title.innerText = "JPG to PDF"; desc.innerText = "Convert images to PDF."; fileInput.multiple = true; fileInput.accept = "image/jpeg, image/png"; 
    } else if (toolName === 'pdfToJpg') { 
        title.innerText = "PDF to JPG"; desc.innerText = "Extract first page as image."; 
    } else if (toolName === 'number') { 
        title.innerText = "Add Page Numbers"; desc.innerText = "Add numbers to PDF pages."; 
    } else if (toolName === 'ocr') { 
        title.innerText = "Extract Text (OCR)"; desc.innerText = "Read text from image/screenshot."; fileInput.accept = "image/*"; 
    } else if (toolName === 'writeText') { 
        title.innerText = "Write on Image"; desc.innerText = "Add custom text to your image."; fileInput.accept = "image/*"; extraInputs.style.display = 'block'; textOptions.style.display = 'block'; 
    }
}

function closeTool() { document.getElementById('toolModal').style.display = 'none'; }

function downloadFile(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function processFile() {
    const fileInput = document.getElementById('fileInput');
    const statusMsg = document.getElementById('statusMsg');

    if (fileInput.files.length === 0) { statusMsg.style.color = "red"; statusMsg.innerText = "Please select a file!"; return; }
    statusMsg.style.color = "#3498db"; statusMsg.innerText = "Processing, please wait...";

    try {
        const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

        if (currentTool === 'merge') {
            const mergedPdf = await PDFDocument.create();
            for (let i = 0; i < fileInput.files.length; i++) {
                const pdf = await PDFDocument.load(await fileInput.files[i].arrayBuffer());
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }
            const bytes = await mergedPdf.save();
            downloadFile(new Blob([bytes], { type: 'application/pdf' }), 'Merged.pdf');
        }
        else if (currentTool === 'split') {
            const pageNum = parseInt(document.getElementById('splitPage').value) - 1;
            const pdf = await PDFDocument.load(await fileInput.files[0].arrayBuffer());
            if (pageNum < 0 || pageNum >= pdf.getPageCount()) throw new Error("Invalid page");
            const newPdf = await PDFDocument.create();
            const [copiedPage] = await newPdf.copyPages(pdf, [pageNum]);
            newPdf.addPage(copiedPage);
            const bytes = await newPdf.save();
            downloadFile(new Blob([bytes], { type: 'application/pdf' }), `Split_Page_${pageNum + 1}.pdf`);
        }
        else if (currentTool === 'rotate') {
            const pdf = await PDFDocument.load(await fileInput.files[0].arrayBuffer());
            pdf.getPages().forEach(page => page.setRotation(degrees(page.getRotation().angle + 90)));
            const bytes = await pdf.save();
            downloadFile(new Blob([bytes], { type: 'application/pdf' }), 'Rotated.pdf');
        }
        else if (currentTool === 'jpgToPdf') {
            const pdfDoc = await PDFDocument.create();
            for (let i = 0; i < fileInput.files.length; i++) {
                const file = fileInput.files[i];
                const bytes = await file.arrayBuffer();
                let image = file.type === 'image/jpeg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
            }
            const pdfBytes = await pdfDoc.save();
            downloadFile(new Blob([pdfBytes], { type: 'application/pdf' }), 'Images_To_PDF.pdf');
        }
        else if (currentTool === 'pdfToJpg') {
            const fileReader = new FileReader();
            fileReader.onload = async function() {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.height = viewport.height; canvas.width = viewport.width;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
                canvas.toBlob((blob) => { downloadFile(blob, 'PDF_to_Image.jpg'); statusMsg.innerText = "Success!"; }, 'image/jpeg');
            };
            fileReader.readAsArrayBuffer(fileInput.files[0]);
            return; 
        }
        else if (currentTool === 'number') {
            const pdf = await PDFDocument.load(await fileInput.files[0].arrayBuffer());
            const font = await pdf.embedFont(StandardFonts.Helvetica);
            pdf.getPages().forEach((page, i) => {
                page.drawText(`Page ${i + 1}`, { x: page.getSize().width / 2 - 20, y: 20, size: 12, font: font, color: rgb(0.5, 0.5, 0.5) });
            });
            const bytes = await pdf.save();
            downloadFile(new Blob([bytes], { type: 'application/pdf' }), 'Numbered.pdf');
        }
        
        // NAYA: IMAGE SE TEXT NIKALNA (OCR)
        else if (currentTool === 'ocr') {
            statusMsg.innerText = "Reading text, please wait 10-15 seconds...";
            const worker = await Tesseract.createWorker('eng');
            const ret = await worker.recognize(fileInput.files[0]);
            
            // Text ko naye tab me dikhado
            const newTab = window.open();
            newTab.document.write(`<body style="margin:0;"><textarea style="width:100%; height:100vh; font-size:18px; padding:20px; box-sizing:border-box; border:none; outline:none;">${ret.data.text}</textarea></body>`);
            newTab.document.title = "Extracted Text - PDF Master";
            await worker.terminate();
            statusMsg.style.color = "#2ecc71";
            statusMsg.innerText = "Success! Text opened in new tab.";
            setTimeout(closeTool, 3000);
            return;
        }

        // NAYA: IMAGE PAR TEXT LIKHNA
        else if (currentTool === 'writeText') {
            const customText = document.getElementById('customText').value;
            if(!customText) throw new Error("Please enter text");
            
            const img = new Image();
            img.src = URL.createObjectURL(fileInput.files[0]);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // Text Style (White text with black outline)
                ctx.font = "bold 40px Arial";
                ctx.fillStyle = "white";
                ctx.strokeStyle = "black";
                ctx.lineWidth = 2;
                
                // Neeche center me text likho
                ctx.textAlign = "center";
                ctx.strokeText(customText, canvas.width/2, canvas.height - 40);
                ctx.fillText(customText, canvas.width/2, canvas.height - 40);
                
                canvas.toBlob((blob) => {
                    downloadFile(blob, 'Edited_Image.jpg');
                    statusMsg.style.color = "#2ecc71";
                    statusMsg.innerText = "Success! Image downloaded.";
                    setTimeout(closeTool, 3000);
                }, 'image/jpeg');
            };
            return;
        }

        statusMsg.style.color = "#2ecc71";
        statusMsg.innerText = "Success! File downloaded.";
        setTimeout(closeTool, 3000);

    } catch (error) {
        console.error(error);
        statusMsg.style.color = "red";
        statusMsg.innerText = error.message || "Error! Process failed.";
    }
}