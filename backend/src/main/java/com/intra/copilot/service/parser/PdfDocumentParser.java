package com.intra.copilot.service.parser;

import com.intra.copilot.service.DocumentParser;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

/** PDF text extraction, one unit per non-empty page. */
@Component
public class PdfDocumentParser implements DocumentParser {

    @Override
    public String id() {
        return "pdf";
    }

    @Override
    public boolean supports(String filename) {
        return filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".pdf");
    }

    @Override
    public List<PageText> parse(byte[] bytes) throws IOException {
        try (var pdf = Loader.loadPDF(bytes)) {
            List<PageText> out = new ArrayList<>();
            PDFTextStripper stripper = new PDFTextStripper();
            for (int page = 1; page <= pdf.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String text = stripper.getText(pdf).trim();
                if (!text.isBlank()) out.add(new PageText(page, null, text));
            }
            return out;
        }
    }
}
