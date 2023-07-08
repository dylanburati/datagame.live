#[macro_export]
macro_rules! match_it {
    ($expression:expr, $it:ident, $pattern:pat $(if $guard:expr)? $(,)?) => {
        match $expression {
            $pattern $(if $guard)? => Some($it),
            _ => None
        }
    };
}
