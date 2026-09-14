package `in`.agrisense.mobile

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun AgriSenseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFF126342), onPrimary = Color.White,
            primaryContainer = Color(0xFFDCEDE1), onPrimaryContainer = Color(0xFF123F2B),
            secondary = Color(0xFF235F75), onSecondary = Color.White,
            secondaryContainer = Color(0xFFE0EEF3), onSecondaryContainer = Color(0xFF17485D),
            tertiary = Color(0xFF885118), onTertiary = Color.White,
            background = Color(0xFFF8FAF8), onBackground = Color(0xFF18251E),
            surface = Color.White, onSurface = Color(0xFF18251E),
            surfaceVariant = Color(0xFFE8EEE9), onSurfaceVariant = Color(0xFF43554A),
            outline = Color(0xFF73867B), outlineVariant = Color(0xFFD5DFD8),
        ),
        typography = Typography(
            headlineLarge = TextStyle(fontFamily = FontFamily.Serif, fontSize = 34.sp, lineHeight = 40.sp),
            headlineMedium = TextStyle(fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 34.sp),
            headlineSmall = TextStyle(fontFamily = FontFamily.Serif, fontSize = 24.sp, lineHeight = 30.sp),
            titleLarge = TextStyle(fontSize = 21.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
            titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold),
        ),
        shapes = Shapes(
            extraSmall = RoundedCornerShape(4.dp), small = RoundedCornerShape(6.dp),
            medium = RoundedCornerShape(8.dp), large = RoundedCornerShape(8.dp),
            extraLarge = RoundedCornerShape(8.dp),
        ),
        content = content,
    )
}