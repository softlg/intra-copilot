package com.intra.copilot.infrastructure.knowledge;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Strict UTF-8 decoding with a GB18030 fallback for common Chinese text files. */
public final class TextContentDecoder {
    private TextContentDecoder() {}

    public static String decode(byte[] bytes) throws IOException {
        byte[] normalized =
                bytes.length >= 3
                                && (bytes[0] & 0xff) == 0xef
                                && (bytes[1] & 0xff) == 0xbb
                                && (bytes[2] & 0xff) == 0xbf
                        ? Arrays.copyOfRange(bytes, 3, bytes.length)
                        : bytes;
        try {
            return decodeStrict(normalized, StandardCharsets.UTF_8);
        } catch (CharacterCodingException utf8Error) {
            try {
                return decodeStrict(normalized, Charset.forName("GB18030"));
            } catch (CharacterCodingException fallbackError) {
                throw new IOException("文本编码无法识别，请使用 UTF-8 或 GB18030", fallbackError);
            }
        }
    }

    private static String decodeStrict(byte[] bytes, Charset charset)
            throws CharacterCodingException {
        return charset.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString();
    }
}
